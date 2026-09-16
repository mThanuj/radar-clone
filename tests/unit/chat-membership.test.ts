import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  canUseChat,
  chatMemberIds,
  chatRoleOf,
  type ChatRoster,
} from "@/lib/chat/membership";

const roster = (over: Partial<ChatRoster> = {}): ChatRoster => ({
  originatorId: "originator",
  assigneeId: "assignee",
  helperIds: ["helper-1", "helper-2"],
  ...over,
});

const person = (id: string) => ({ id, isAdmin: false });
const admin = (id: string) => ({ id, isAdmin: true });

describe("canUseChat", () => {
  it("admits the three roles the chat is for", () => {
    expect(canUseChat(roster(), person("originator"))).toBe(true);
    expect(canUseChat(roster(), person("assignee"))).toBe(true);
    expect(canUseChat(roster(), person("helper-1"))).toBe(true);
    expect(canUseChat(roster(), person("helper-2"))).toBe(true);
  });

  it("shuts out everyone else, including CC and watchers", () => {
    // The roster carries no CC or WATCHER ids at all, which is the point:
    // radarAudience() includes both, and reusing it here — the obvious-looking
    // simplification — would hand the chat to anyone who clicked "watch".
    expect(canUseChat(roster(), person("cc-subscriber"))).toBe(false);
    expect(canUseChat(roster(), person("watcher"))).toBe(false);
    expect(canUseChat(roster(), person("stranger"))).toBe(false);
  });

  it("lets an admin in without a role on the radar", () => {
    expect(canUseChat(roster(), admin("auditor"))).toBe(true);
  });

  it("does not match a null assignee", () => {
    // An unassigned radar must not admit a viewer whose id is somehow falsy,
    // and must not crash reading it.
    const unassigned = roster({ assigneeId: null });
    expect(canUseChat(unassigned, person("stranger"))).toBe(false);
    expect(chatMemberIds(unassigned)).not.toContain(null);
    expect(chatMemberIds(unassigned)).toEqual([
      "originator",
      "helper-1",
      "helper-2",
    ]);
  });
});

describe("chatMemberIds", () => {
  it("collapses one person wearing three hats into one member", () => {
    const solo = roster({
      originatorId: "sam",
      assigneeId: "sam",
      helperIds: ["sam"],
    });
    expect(chatMemberIds(solo)).toEqual(["sam"]);
  });

  it("never contains an admin who is only there by override", () => {
    // This list is the realtime push list too. An admin on it would receive
    // every chat message in the system on their channel.
    const ids = chatMemberIds(roster());
    expect(ids).not.toContain("auditor");
    expect(canUseChat(roster(), admin("auditor"))).toBe(true);
  });

  it("holds no duplicates and invents nobody", () => {
    fc.assert(
      fc.property(
        fc.record({
          originatorId: fc.string({ minLength: 1 }),
          assigneeId: fc.option(fc.string({ minLength: 1 }), { nil: null }),
          helperIds: fc.array(fc.string({ minLength: 1 })),
        }),
        (generated) => {
          const ids = chatMemberIds(generated);
          const input = new Set([
            generated.originatorId,
            generated.assigneeId,
            ...generated.helperIds,
          ]);
          expect(new Set(ids).size).toBe(ids.length);
          expect(ids.every((id) => input.has(id))).toBe(true);
        },
      ),
    );
  });
});

describe("chatRoleOf", () => {
  it("reports the sharpest role when someone wears several", () => {
    const both = roster({ originatorId: "sam", assigneeId: "sam" });
    expect(chatRoleOf(both, person("sam"))).toBe("assignee");

    const helperToo = roster({ originatorId: "sam", assigneeId: null, helperIds: ["sam"] });
    expect(chatRoleOf(helperToo, person("sam"))).toBe("helper");

    expect(chatRoleOf(roster(), person("originator"))).toBe("originator");
  });

  it("calls an outsider admin an admin, and a stranger nothing", () => {
    expect(chatRoleOf(roster(), admin("auditor"))).toBe("admin");
    expect(chatRoleOf(roster(), person("stranger"))).toBeNull();
  });

  it("prefers a real role over the admin override", () => {
    // An admin who is also the assignee is in the room as the assignee, so
    // their messages must not be chipped as an outsider's.
    expect(chatRoleOf(roster(), admin("assignee"))).toBe("assignee");
  });
});
