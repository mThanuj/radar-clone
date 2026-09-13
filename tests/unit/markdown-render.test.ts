import { describe, expect, it } from "vitest";
import { renderMarkdown } from "@/lib/markdown-render";

/**
 * Shiki is loaded only for documents that contain a code block, because
 * pulling its language index costs about three seconds the first time and was
 * being paid by the first comment any serverless instance rendered.
 *
 * That makes the detection the fragile part: miss a code block and it renders
 * unhighlighted, with nothing failing to say so. These assert both sides of
 * it — highlighted when there is code, untouched when there isn't.
 */
describe("renderMarkdown", () => {
  it("renders prose without reaching for the highlighter", async () => {
    const html = await renderMarkdown("Hello **world**, and some `inline` code.");
    expect(html).toContain("<strong>world</strong>");
    expect(html).toContain("<code>inline</code>");
    expect(html).not.toContain("shiki");
  });

  it("highlights a fenced block, in both themes", async () => {
    const html = await renderMarkdown("```ts\nconst x: number = 1\n```");
    expect(html).toContain('class="shiki');
    // globals.css picks between these two per colour scheme; emitting only one
    // would leave code unreadable in the other.
    expect(html).toContain("--shiki-light");
    expect(html).toContain("--shiki-dark");
  });

  it("highlights a fence whose language is spaced off the ticks", async () => {
    const html = await renderMarkdown("``` swift\nlet x = 1\n```");
    expect(html).toContain('class="shiki');
  });

  it("leaves un-languaged blocks alone, and skips the highlighter for them", async () => {
    // rehype-shiki does nothing with these either way — no defaultLanguage is
    // set — so loading it for a pasted log would be pure cost. Both render as
    // a plain block, exactly as they did before the split.
    for (const source of ["```\nsome log line\n```", "Text:\n\n    const x = 1\n"]) {
      const html = await renderMarkdown(source);
      expect(html).toContain("<pre><code>");
      expect(html).not.toContain("shiki");
    }
  });

  it("falls back rather than throwing on a language we do not ship", async () => {
    const html = await renderMarkdown("```brainfuck\n+++[->+++<]\n```");
    expect(html).toContain("<pre");
    expect(html).toContain("+++");
  });

  it("still strips anything dangerous", async () => {
    const html = await renderMarkdown(
      '<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">',
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
  });

  it("links rdar references and marks up handles", async () => {
    const html = await renderMarkdown("dupe of rdar://100000042, cc @sam.lee");
    expect(html).toContain('href="/radars/100000042"');
    expect(html).toContain("<code>@sam.lee</code>");
  });

  it("leaves code fences alone when autolinking", async () => {
    // A pasted log line must not sprout links.
    const html = await renderMarkdown("```\nsee rdar://100000042 and @sam\n```");
    expect(html).not.toContain('href="/radars/100000042"');
  });
});
