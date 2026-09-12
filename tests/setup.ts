import "dotenv/config";

/**
 * SMTP and Upstash are required at startup (src/lib/env.ts), so the suite
 * supplies placeholders rather than leaving them unset.
 *
 * EMAIL_TRANSPORT=json is the important one: it forces nodemailer to render
 * messages instead of sending them, so tests exercise the whole pipeline
 * without mail escaping — even when real Gmail credentials are in .env.
 */
process.env.EMAIL_TRANSPORT = "json";
// ||= rather than ??=: a variable present but empty in .env (a half-filled
// template) must still fall back to the placeholder, or the suite fails on
// the developer machine but not in CI.
process.env.SMTP_HOST ||= "smtp.invalid";
process.env.SMTP_PORT ||= "587";
process.env.SMTP_USER ||= "tests@radar.local";
process.env.SMTP_PASS ||= "not-a-real-password";
process.env.SMTP_FROM ||= "Radar Tests <tests@radar.local>";
process.env.UPSTASH_REDIS_REST_URL ||= "https://upstash.invalid";
process.env.UPSTASH_REDIS_REST_TOKEN ||= "not-a-real-token";
process.env.BETTER_AUTH_SECRET ||= "test-secret-at-least-16-chars";
