/**
 * Exercises better-auth against the real database without a listening server
 * (the sandbox denies binding to any port). Run with:
 *
 *   node --conditions=react-server --env-file=.env --import tsx/esm scripts/auth-smoke.mts
 *
 * The react-server condition is what makes `import "server-only"` resolve to
 * its no-op build instead of throwing.
 */
import { auth } from "../src/lib/auth";
import { db } from "../src/lib/db";

const email = `smoke+${Date.now()}@radar.local`;
const password = "smoke-test-password";

const signUp = await auth.api.signUpEmail({
  body: { email, password, name: "Smoke Test" },
});
console.log("signUp ->", signUp.user.id, signUp.user.email);

const row = await db.user.findUnique({
  where: { email },
  select: { handle: true, isAdmin: true, isActive: true, name: true },
});
console.log("user row ->", row);

const signIn = await auth.api.signInEmail({
  body: { email, password },
  asResponse: true,
});
console.log("signIn ->", signIn.status, signIn.headers.get("set-cookie") ? "session cookie set" : "NO COOKIE");

const sessions = await db.session.count();
console.log("sessions in db ->", sessions);

// clean up after ourselves
await db.user.delete({ where: { email } });
console.log("cleaned up");
process.exit(0);
