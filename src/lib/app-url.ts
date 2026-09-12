/**
 * Where this deployment lives, for absolute links.
 *
 * Shared by better-auth's origin checking and by email templates, so a link in
 * a notification can never point somewhere the app won't accept a session from.
 *
 * BETTER_AUTH_URL wins when set (local dev). Otherwise it comes from Vercel's
 * system env: the stable production domain in production, the per-deployment
 * URL in previews.
 */
const trimSlashes = (value: string) => value.replace(/\/+$/, "");

export function resolveAppBaseUrl(): string {
  if (process.env.BETTER_AUTH_URL) return trimSlashes(process.env.BETTER_AUTH_URL);

  const host =
    process.env.VERCEL_ENV === "production"
      ? process.env.VERCEL_PROJECT_PRODUCTION_URL
      : process.env.VERCEL_URL;

  return host ? `https://${trimSlashes(host)}` : "http://localhost:3000";
}

/** Absolute URL for a path, e.g. appUrl("/radars/100000042"). */
export function appUrl(path = "/"): string {
  return new URL(path, `${resolveAppBaseUrl()}/`).toString();
}
