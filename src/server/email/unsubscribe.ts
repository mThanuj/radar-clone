import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { NotificationCategory } from "@/generated/prisma/enums";
import { appUrl } from "@/lib/app-url";

/**
 * One-click unsubscribe links.
 *
 * A signed token rather than a session, because the whole point is that it
 * works from a mail client with no login. The token authorises exactly one
 * thing — turning email off for one category for one user — so a leaked link
 * cannot read or change anything else.
 */
const SECRET = () => process.env.BETTER_AUTH_SECRET ?? "insecure-dev-secret";

function sign(payload: string): string {
  return createHmac("sha256", SECRET()).update(payload).digest("base64url");
}

export function mintUnsubscribeToken(
  userId: string,
  category: NotificationCategory,
): string {
  const payload = `${userId}:${category}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

export function verifyUnsubscribeToken(
  token: string,
): { userId: string; category: NotificationCategory } | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  let payload: string;
  try {
    payload = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const expected = sign(payload);
  // Constant-time compare; lengths must match first or timingSafeEqual throws.
  if (expected.length !== signature.length) return null;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;

  const [userId, category] = payload.split(":");
  if (!userId || !category) return null;

  return { userId, category: category as NotificationCategory };
}

export function unsubscribeUrl(
  userId: string,
  category: NotificationCategory,
): string {
  return appUrl(`/api/unsubscribe?token=${mintUnsubscribeToken(userId, category)}`);
}
