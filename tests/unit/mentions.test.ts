import { describe, expect, it } from "vitest";
import {
  EVERYONE_HANDLE,
  extractMentions,
  mentionQueryAt,
  mentionsEveryone,
} from "@/lib/markdown";

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

  it("offers the broadcast while @all is still being typed", () => {
    // The menu shows the "Everyone" row for any prefix of "all", so these are
    // the queries that have to keep opening it.
    for (const text of ["@", "@a", "@al", "@all"]) {
      const trigger = at(text);
      expect(trigger).not.toBeNull();
      expect(EVERYONE_HANDLE.startsWith(trigger!.query)).toBe(true);
    }
  });
});

describe("mentionsEveryone", () => {
  it("reads @all as the broadcast, whatever the casing", () => {
    expect(mentionsEveryone("@all heads up")).toBe(true);
    expect(mentionsEveryone("heads up @All")).toBe(true);
    expect(mentionsEveryone("ship it, @sam @all")).toBe(true);
  });

  it("is not triggered by a handle that merely starts with it", () => {
    // @allison must reach one person, not the company.
    expect(mentionsEveryone("@allison please review")).toBe(false);
    expect(mentionsEveryone("mail all@radar.local")).toBe(false);
    expect(mentionsEveryone("nobody is mentioned here")).toBe(false);
  });

  it("stays shut inside code, exactly like a handle mention", () => {
    expect(mentionsEveryone("run `@all` to broadcast")).toBe(false);
    expect(mentionsEveryone("```\n@all\n```")).toBe(false);
  });

  it("keeps the reserved handle out of the people lookup", () => {
    // Otherwise a stray account holding "all" would be notified personally as
    // well as everyone being notified — two meanings for one word.
    expect(extractMentions("@all and @sam")).toEqual(["sam"]);
    expect(extractMentions("@all")).toEqual([]);
  });
});
