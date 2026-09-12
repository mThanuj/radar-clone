import "server-only";
import { env } from "@/lib/env";

/**
 * Vercel Cron authenticates with `Authorization: Bearer $CRON_SECRET`.
 *
 * Without a secret configured this returns false, so an unconfigured
 * deployment has closed cron endpoints rather than open ones.
 */
export function isCronAuthorized(request: Request): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
