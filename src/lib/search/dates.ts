/**
 * Date tokens for filters. Relative tokens are resolved against the request
 * time rather than baked in, so a saved query like `createdAt=gte:-30d` keeps
 * rolling instead of pinning to the day it was saved.
 *
 * Accepted: -7d  -24h  -3mo  -1y  now  today  yesterday  2026-09-11
 */
const RELATIVE = /^-(\d+)(m|h|d|w|mo|y)$/;

const MS = {
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
} as const;

export class DateTokenError extends Error {}

export function parseDateToken(token: string, now = new Date()): Date {
  if (token === "now") return new Date(now);

  if (token === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  if (token === "yesterday") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 1);
    return d;
  }

  const relative = RELATIVE.exec(token);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2] as keyof typeof MS | "mo" | "y";
    const d = new Date(now);
    if (unit === "mo") d.setMonth(d.getMonth() - amount);
    else if (unit === "y") d.setFullYear(d.getFullYear() - amount);
    else d.setTime(d.getTime() - amount * MS[unit]);
    return d;
  }

  const parsed = new Date(token);
  if (Number.isNaN(parsed.getTime())) {
    throw new DateTokenError(
      `"${token}" is not a date. Use 2026-09-11, today, now, or -7d / -3mo / -1y.`,
    );
  }
  return parsed;
}

export function isDateToken(token: string): boolean {
  try {
    parseDateToken(token);
    return true;
  } catch {
    return false;
  }
}
