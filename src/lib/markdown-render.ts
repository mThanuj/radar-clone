import "server-only";
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

/** Everything up to the point where highlighting would run. */
const basePipeline = () =>
  unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSanitize, schema);

const plainProcessor = basePipeline().use(rehypeStringify);

/**
 * Grammars we ship. Anything else still renders as a styled code block, just
 * without colour — see fallbackLanguage below.
 *
 * Spelled out because the alternative is the `shiki` bundle entrypoint, whose
 * index pulls metadata for every language and theme it knows about. That
 * import alone measured ~3s, and it was being paid on the first comment or
 * description rendered by each serverless instance.
 */
const LANGS = [
  () => import("shiki/langs/bash.mjs"),
  () => import("shiki/langs/c.mjs"),
  () => import("shiki/langs/cpp.mjs"),
  () => import("shiki/langs/csharp.mjs"),
  () => import("shiki/langs/css.mjs"),
  () => import("shiki/langs/diff.mjs"),
  () => import("shiki/langs/go.mjs"),
  () => import("shiki/langs/html.mjs"),
  () => import("shiki/langs/java.mjs"),
  () => import("shiki/langs/javascript.mjs"),
  () => import("shiki/langs/json.mjs"),
  () => import("shiki/langs/kotlin.mjs"),
  () => import("shiki/langs/markdown.mjs"),
  () => import("shiki/langs/objective-c.mjs"),
  () => import("shiki/langs/python.mjs"),
  () => import("shiki/langs/ruby.mjs"),
  () => import("shiki/langs/rust.mjs"),
  () => import("shiki/langs/sql.mjs"),
  () => import("shiki/langs/swift.mjs"),
  () => import("shiki/langs/tsx.mjs"),
  () => import("shiki/langs/typescript.mjs"),
  () => import("shiki/langs/yaml.mjs"),
];

/**
 * Built once per process, on the first document that actually contains a code
 * block. Stored as the promise rather than the result so two concurrent
 * renders share one initialization instead of racing to do it twice.
 */
let highlightProcessor: Promise<ReturnType<typeof plainProcessor.freeze>> | null =
  null;

function getHighlightProcessor() {
  highlightProcessor ??= (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }, rehype] =
      await Promise.all([
        import("shiki/core"),
        import("shiki/engine/javascript"),
        import("@shikijs/rehype/core"),
      ]);

    const highlighter = await createHighlighterCore({
      // The high-contrast pair, not plain github-light/dark. We render code on
      // --muted rather than on the theme's own background, and github-dark's
      // comment token (#6a737d) lands at 3.14:1 there — under AA, on the text
      // people read most slowly. These clear 4.5:1 for every token.
      themes: [
        import("shiki/themes/github-light-high-contrast.mjs"),
        import("shiki/themes/github-dark-high-contrast.mjs"),
      ],
      langs: LANGS.map((load) => load()),
      // The JS engine skips compiling the Oniguruma WASM. Shiki flags a few
      // exotic grammars as unsupported by it; `forgiving` drops those patterns
      // rather than throwing, so the worst case is a missed colour.
      engine: createJavaScriptRegexEngine({ forgiving: true }),
    });

    return basePipeline()
      .use(rehype.default, highlighter as Parameters<typeof rehype.default>[0], {
        themes: {
          light: "github-light-high-contrast",
          dark: "github-dark-high-contrast",
        },
        defaultColor: false,
        // A language we don't ship must not take the page down with it.
        fallbackLanguage: "plaintext",
      })
      .use(rehypeStringify)
      .freeze();
  })();

  return highlightProcessor;
}

/**
 * A fenced block that names a language.
 *
 * Deliberately narrower than "contains code". Inline highlighting is off, and
 * with no defaultLanguage set rehype-shiki leaves bare fences and indented
 * blocks as plain <pre><code> — so routing those through it would buy nothing
 * but its load time, and a pasted log in a bare fence is the common case here.
 */
const HAS_HIGHLIGHTABLE_CODE = /^\s{0,3}(?:`{3,}|~{3,})[ \t]*[^\s`~]/m;

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
 * Turn `rdar://100000042` into a link, and highlight @handles. The legacy
 * `rdar://problem/…` spelling is matched too, and normalized in the link text.
 * Runs before parsing so the result is ordinary markdown — and skips code so
 * a pasted log line doesn't sprout links.
 */
function autolink(markdown: string): string {
  return mapOutsideCode(markdown, (chunk) =>
    chunk
      .replace(
        /(?<!\]\()rdar:\/\/(?:problem\/)?(\d{6,})/g,
        (_match, number: string) => `[rdar://${number}](/radars/${number})`,
      )
      .replace(
        /(^|[^\w@`[])@([a-z0-9][a-z0-9._-]{1,30})/gi,
        (_match, prefix: string, handle: string) => `${prefix}\`@${handle}\``,
      ),
  );
}

export async function renderMarkdown(source: string): Promise<string> {
  const markdown = autolink(source);
  const processor = HAS_HIGHLIGHTABLE_CODE.test(markdown)
    ? await getHighlightProcessor()
    : plainProcessor;
  return String(await processor.process(markdown));
}
