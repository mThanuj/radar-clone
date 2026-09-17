import { formatDistanceToNowStrict, format, isThisYear, isToday } from "date-fns";

export const RADAR_NUMBER_START = 100_000_000;

export function radarHref(number: number | string): string {
  return `/radars/${number}`;
}

export function rdarUri(number: number | string): string {
  return `rdar://${number}`;
}

/**
 * Matches radar references in free text so they can be linked. The legacy
 * `problem/` form is still accepted on input, but never emitted:
 *   rdar://100000042   rdar://problem/100000042   <rdar://100000042>
 * Bare 9+ digit numbers are deliberately NOT matched — too many false hits
 * against build numbers and timestamps.
 */
export const RADAR_REF_PATTERN = /rdar:\/\/(?:problem\/)?(\d{6,})/g;

export function extractRadarRefs(text: string): number[] {
  const found = new Set<number>();
  for (const match of text.matchAll(RADAR_REF_PATTERN)) {
    found.add(Number(match[1]));
  }
  return [...found];
}

/** "2 hours ago", "3 days ago" */
export function relativeTime(date: Date | string): string {
  return formatDistanceToNowStrict(new Date(date), { addSuffix: true });
}

/** Compact absolute form for table cells: "14:32", "11 Sep", "11 Sep 2025" */
export function compactDate(date: Date | string | null): string {
  if (!date) return "—";
  const d = new Date(date);
  if (isToday(d)) return format(d, "HH:mm");
  return isThisYear(d) ? format(d, "d MMM") : format(d, "d MMM yyyy");
}

/** Full form for tooltips and the detail sidebar. */
export function fullDate(date: Date | string | null): string {
  if (!date) return "—";
  return format(new Date(date), "d MMM yyyy 'at' HH:mm");
}

export function dayKey(date: Date | string): string {
  return format(new Date(date), "yyyy-MM-dd");
}

export function dayLabel(date: Date | string): string {
  const d = new Date(date);
  if (isToday(d)) return "Today";
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (dayKey(d) === dayKey(yesterday)) return "Yesterday";
  return isThisYear(d) ? format(d, "EEEE d MMMM") : format(d, "d MMMM yyyy");
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
