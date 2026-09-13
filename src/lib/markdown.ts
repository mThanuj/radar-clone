/** Cheap markdown -> plain text, for the `bodyText` search column. */
export function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ") // fenced code
    .replace(/`([^`]*)`/g, "$1") // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links -> text
    .replace(/^\s{0,3}>\s?/gm, "") // blockquotes
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // headings
    .replace(/^\s{0,3}[-*+]\s+/gm, "") // bullets
    .replace(/(\*\*|__|\*|_|~~)/g, "") // emphasis
    .replace(/\s+/g, " ")
    .trim();
}

/** @handle mentions, excluding ones inside code spans or fences. */
export function extractMentions(markdown: string): string[] {
  const withoutCode = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ");
  const handles = new Set<string>();
  for (const match of withoutCode.matchAll(/(?:^|[^\w@])@([a-z0-9][a-z0-9._-]{1,30})/gi)) {
    handles.add(match[1].toLowerCase());
  }
  return [...handles];
}

/**
 * Whether a caret sitting at the end of `before` is inside code.
 *
 * A cheap approximation of what extractMentions strips: an odd number of
 * fences means we're inside one, an odd number of backticks on the current
 * line means we're inside an inline span. Good enough to decide whether to
 * offer a menu — it costs a missing affordance when it's wrong, not a wrong
 * mention.
 */
function isInsideCode(before: string): boolean {
  if (((before.match(/```/g)?.length ?? 0) & 1) === 1) return true;
  const line = before.slice(before.lastIndexOf("\n") + 1);
  return ((line.match(/`/g)?.length ?? 0) & 1) === 1;
}

/**
 * The @mention being typed at `caret`, or null when there isn't one.
 *
 * Lives next to extractMentions because the two have to agree about what
 * counts as a mention. Offering the menu somewhere a handle would not be
 * picked up — mid-word, in an email address, inside code — teaches people the
 * mention worked when it silently didn't.
 *
 * The trailing group is looser than extractMentions on purpose: it matches the
 * empty string, so the menu opens on the bare "@" before there is anything to
 * filter by.
 */
export function mentionQueryAt(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  if (isInsideCode(before)) return null;

  const match = /(?:^|[^\w@])@([a-z0-9._-]*)$/i.exec(before);
  if (!match) return null;

  const query = match[1];
  return { start: caret - query.length - 1, query };
}
