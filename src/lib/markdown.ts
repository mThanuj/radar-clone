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
