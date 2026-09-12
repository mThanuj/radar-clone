import "server-only";
import rehypeShiki from "@shikijs/rehype";
import { defaultSchema } from "hast-util-sanitize";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

/**
 * Markdown -> HTML for descriptions and comments.
 *
 * Done as an async unified pipeline rather than react-markdown because Shiki
 * highlighting is async, and react-markdown runs its pipeline synchronously.
 * These are server components, so awaiting here costs nothing.
 *
 * Sanitize runs BEFORE Shiki: the highlighter emits spans with inline styles
 * that a sanitizer would otherwise strip.
 */
const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    span: [...(defaultSchema.attributes?.span ?? []), "className", "style"],
    code: [...(defaultSchema.attributes?.code ?? []), "className"],
    pre: [...(defaultSchema.attributes?.pre ?? []), "className", "style"],
    a: [...(defaultSchema.attributes?.a ?? []), "className"],
  },
};

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSanitize, schema)
  .use(rehypeShiki, {
    themes: { light: "github-light", dark: "github-dark" },
    defaultColor: false,
  })
  .use(rehypeStringify);

/** Segments outside code fences and inline code, where linking is safe. */
function mapOutsideCode(source: string, fn: (chunk: string) => string): string {
  return source
    .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
    .map((part) =>
      part.startsWith("```") || part.startsWith("`") ? part : fn(part),
    )
    .join("");
}

/**
 * Turn `rdar://problem/100000042` into a link, and highlight @handles.
 * Runs before parsing so the result is ordinary markdown — and skips code so
 * a pasted log line doesn't sprout links.
 */
function autolink(markdown: string): string {
  return mapOutsideCode(markdown, (chunk) =>
    chunk
      .replace(
        /(?<!\]\()rdar:\/\/(?:problem\/)?(\d{6,})/g,
        (_match, number: string) => `[rdar://problem/${number}](/radars/${number})`,
      )
      .replace(
        /(^|[^\w@`[])@([a-z0-9][a-z0-9._-]{1,30})/gi,
        (_match, prefix: string, handle: string) => `${prefix}\`@${handle}\``,
      ),
  );
}

export async function renderMarkdown(source: string): Promise<string> {
  const file = await processor.process(autolink(source));
  return String(file);
}
