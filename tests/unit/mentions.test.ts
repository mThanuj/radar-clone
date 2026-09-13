import { describe, expect, it } from "vitest";
import { extractMentions, mentionQueryAt } from "@/lib/markdown";

/** Caret at the end of the text, which is where someone typing actually is. */
const at = (text: string) => mentionQueryAt(text, text.length);

describe("mentionQueryAt", () => {
  it("opens on the bare @, before there is anything to filter by", () => {
    expect(at("@")).toEqual({ start: 0, query: "" });
    expect(at("hey @")).toEqual({ start: 4, query: "" });
  });

  it("reports the partial handle and where it starts", () => {
    expect(at("please look @sa")).toEqual({ start: 12, query: "sa" });
    expect(at("@sam.lee")).toEqual({ start: 0, query: "sam.lee" });
  });

  it("stays shut mid-word and in email addresses", () => {
    // Both are cases extractMentions also refuses, which is the point.
    expect(at("name@example.com")).toBeNull();
    expect(extractMentions("name@example.com")).toEqual([]);
    expect(at("rdar@@")).toBeNull();
  });

  it("stays shut once the mention is finished", () => {
    // The space ends it; offering the menu again would fight the next word.
    expect(at("@sam ")).toBeNull();
    expect(at("@sam and")).toBeNull();
  });

  it("does not span a line break", () => {
    expect(at("@sam\nnext")).toBeNull();
  });

  it("stays shut inside code, where a handle would not notify", () => {
    expect(at("run `@sa")).toBeNull();
    expect(at("```\n@sa")).toBeNull();
    expect(extractMentions("run `@sam` please")).toEqual([]);

    // ...and opens again once the span or fence is closed.
    expect(at("run `code` @sa")).toEqual({ start: 11, query: "sa" });
    expect(at("```\ncode\n```\n@sa")).toEqual({ start: 13, query: "sa" });
  });

  it("reads the caret, not the end of the text", () => {
    const text = "@sam trailing words";
    expect(mentionQueryAt(text, 4)).toEqual({ start: 0, query: "sam" });
  });

  it("agrees with extractMentions about what a finished mention is", () => {
    const trigger = at("ping @sam.lee-2");
    expect(trigger).not.toBeNull();
    // The same text, once sent, has to yield the handle the menu was offering.
    expect(extractMentions("ping @sam.lee-2")).toEqual(["sam.lee-2"]);
  });
});
