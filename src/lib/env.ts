import "server-only";
import { z } from "zod";

/**
 * Environment validation.
 *
 * Checked once at import so a missing variable is a startup error naming the
 * variable, rather than a confusing failure hours later when the first email
 * tries to send.
 *
 * SMTP and Upstash are required: silently degrading to "logs instead of
 * sending" or "polls instead of pushing" is fine as a *runtime* fallback when
 * a service is down, but it is a bad default for a missing config — it hides
 * the mistake instead of reporting it.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),

  BETTER_AUTH_SECRET: z.string().min(16, "must be at least 16 characters"),
  // Optional: on Vercel the host is derived from VERCEL_* system variables.
  BETTER_AUTH_URL: z.string().optional(),

  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().min(1),
  SMTP_PASS: z.string().min(1),
  SMTP_FROM: z.string().min(1),

  UPSTASH_REDIS_REST_URL: z.string().min(1),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),

  CRON_SECRET: z.string().min(8).optional(),

  /**
   * Set to "json" by the test suite so nodemailer renders messages instead of
   * sending them. Explicit rather than inferred from a missing host, so
   * production can never fall into it by forgetting a variable.
   */
  EMAIL_TRANSPORT: z.enum(["smtp", "json"]).default("smtp"),
});

const WHERE_TO_GET: Record<string, string> = {
  SMTP_HOST: "smtp.gmail.com for Gmail",
  SMTP_USER: "your Gmail address",
  SMTP_PASS:
    "Google Account → Security → 2-Step Verification → App passwords (16 chars)",
  SMTP_FROM: 'e.g. "Radar <you@gmail.com>"',
  UPSTASH_REDIS_REST_URL:
    "console.upstash.com → your Redis database → REST API → UPSTASH_REDIS_REST_URL",
  UPSTASH_REDIS_REST_TOKEN:
    "console.upstash.com → your Redis database → REST API → UPSTASH_REDIS_REST_TOKEN",
  BETTER_AUTH_SECRET: "generate one with: openssl rand -base64 32",
};

function load(): Env {
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    const lines = parsed.error.issues.map((issue) => {
      const key = String(issue.path[0]);
      const hint = WHERE_TO_GET[key];
      return `  ${key}: ${issue.message}${hint ? `\n      → ${hint}` : ""}`;
    });

    throw new Error(
      `Missing or invalid environment variables:\n\n${lines.join("\n")}\n\n` +
        `See .env.example, and README.md → "Getting the credentials".\n`,
    );
  }

  return parsed.data;
}

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/**
 * Validate now. Called from instrumentation.ts so a misconfigured server dies
 * at boot with a useful message instead of on the first request that happens
 * to need a variable.
 */
export function validateEnv(): Env {
  cached ??= load();
  return cached;
}

/**
 * Validation is lazy — on first read, not at import.
 *
 * `next build` imports every module to collect routes, and a build has no
 * business requiring runtime secrets: it would mean a Vercel preview with no
 * env configured fails to *build* rather than failing to run, which is a much
 * worse error to debug. Boot-time validation still happens, via
 * instrumentation.ts.
 */
export const env: Env = new Proxy({} as Env, {
  get: (_target, key) => validateEnv()[key as keyof Env],
  has: (_target, key) => key in validateEnv(),
  ownKeys: () => Reflect.ownKeys(validateEnv()),
  getOwnPropertyDescriptor: (_target, key) =>
    Reflect.getOwnPropertyDescriptor(validateEnv(), key),
});

/** Cron endpoints refuse everything until this is set. */
export const isCronConfigured = () => Boolean(env.CRON_SECRET);
