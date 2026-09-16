import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import { EVERYONE_HANDLE } from "@/lib/markdown";
import { hasMailExchanger } from "@/server/email/domain-check";
import { renderVerificationEmail } from "@/server/email/templates";
import { fromAddress, getTransport } from "@/server/email/transport";

/**
 * Derive a Radar-style handle ("tmullaguri") from an email address, since
 * sign-up only asks for name/email/password but User.handle is NOT NULL and
 * unique — it's what @mentions and assignee search key off.
 */
async function deriveHandle(email: string): Promise<string> {
  const base =
    email
      .split("@")[0]
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 24) || "user";

  for (let attempt = 0; ; attempt++) {
    const candidate = attempt === 0 ? base : `${base}${attempt + 1}`;
    // all@… is a real address to sign up with, and "all" is the broadcast
    // handle. Skipping it here hands that person "all2" instead.
    if (candidate === EVERYONE_HANDLE) continue;
    const taken = await db.user.findUnique({
      where: { handle: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
}

/**
 * Where this deployment thinks it lives.
 *
 * better-auth rejects any request whose Origin doesn't match baseURL or a
 * trusted origin ("Invalid origin"). On Vercel that bites twice: the stable
 * production domain differs from the per-deployment URL, and every preview
 * gets its own hostname. So derive it from Vercel's system env vars instead of
 * pinning one URL by hand.
 *
 * BETTER_AUTH_URL still wins when set, which is what local dev uses.
 */
function resolveBaseURL(): string {
  // Trailing slashes are the classic footgun here: the origin check compares
  // the configured value against the request's origin, which never has one, so
  // "https://app.example.com/" silently matches nothing.
  const trim = (url: string) => url.replace(/\/+$/, "");

  if (process.env.BETTER_AUTH_URL) return trim(process.env.BETTER_AUTH_URL);

  const host =
    process.env.VERCEL_ENV === "production"
      ? process.env.VERCEL_PROJECT_PRODUCTION_URL
      : process.env.VERCEL_URL;

  return host ? `https://${trim(host)}` : "http://localhost:3000";
}

const baseURL = resolveBaseURL();

/** Every host this deployment can legitimately be reached on. */
const trustedOrigins = [
  ...new Set(
    [
      baseURL,
      ...[
        process.env.VERCEL_URL,
        process.env.VERCEL_BRANCH_URL,
        process.env.VERCEL_PROJECT_PRODUCTION_URL,
      ]
        .filter((host): host is string => Boolean(host))
        .map((host) => `https://${host}`),
    ].filter(Boolean),
  ),
];

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL,
  trustedOrigins,
  emailAndPassword: {
    enabled: true,
    // Soft verification: we send the link, but an unverified account still
    // works. Requiring it would mean a broken SMTP config locks everyone out,
    // including whoever needs to log in and fix it.
    requireEmailVerification: false,
    minPasswordLength: 8,
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24,
    sendVerificationEmail: async ({ user, url }) => {
      const rendered = renderVerificationEmail({ name: user.name, url });
      await getTransport().sendMail({
        from: fromAddress(),
        to: user.email,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      });
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  // Sign-in and sign-up are the only unauthenticated write endpoints, so they
  // are the only ones worth throttling.
  rateLimit: {
    enabled: true,
    window: 60,
    max: 20,
    customRules: {
      "/sign-in/email": { window: 60, max: 8 },
      "/sign-up/email": { window: 300, max: 5 },
    },
  },
  user: {
    additionalFields: {
      handle: { type: "string", required: false, input: false },
      jobTitle: { type: "string", required: false, input: true },
      isActive: { type: "boolean", required: false, input: false },
      isAdmin: { type: "boolean", required: false, input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          // Reject addresses whose domain could never receive mail. Fails
          // open on any DNS trouble — see hasMailExchanger.
          if (!(await hasMailExchanger(user.email))) {
            throw new APIError("BAD_REQUEST", {
              message: `${user.email.split("@")[1]} doesn't look like it can receive email. Check the spelling.`,
            });
          }
          return { data: { ...user, handle: await deriveHandle(user.email) } };
        },
      },
    },
  },
  // Must be last: lets server actions set the session cookie.
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
