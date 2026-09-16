import { describe, expect, it } from "vitest";
import {
  ALL_REASONS,
  CATEGORIES,
  CATEGORY_ORDER,
  REASONS,
  categoryOf,
  isForced,
  mostSpecific,
} from "@/lib/notifications/catalog";
import { classifyReasons } from "@/lib/notifications/classify";
import { diffRadar } from "@/server/activity/record";
import { NotificationReason } from "@/generated/prisma/enums";

describe("catalog", () => {
  it("covers every reason the schema can produce", () => {
    // A reason with no entry would notify nobody and silently vanish.
    const schemaReasons = Object.keys(NotificationReason).sort();
    expect(ALL_REASONS.sort()).toEqual(schemaReasons);
  });

  it("puts every reason in a category that exists and is displayed", () => {
    for (const reason of ALL_REASONS) {
      const category = categoryOf(reason);
      expect(CATEGORIES[category]).toBeDefined();
      expect(CATEGORY_ORDER).toContain(category);
    }
  });

  it("gives every reason a distinct precedence, so ties are never arbitrary", () => {
    const precedences = ALL_REASONS.map((r) => REASONS[r].precedence);
    expect(new Set(precedences).size).toBe(precedences.length);
  });

  it("gives every reason a template", () => {
    for (const reason of ALL_REASONS) {
      expect(REASONS[reason].template).toMatch(/^[a-z-]+$/);
    }
  });

  it("forces only the reasons that name you personally", () => {
    expect(ALL_REASONS.filter(isForced)).toEqual(["MENTIONED"]);
  });

  it("prefers the sharper reason when one mutation produces several", () => {
    expect(mostSpecific("SUBSCRIBED", "ASSIGNED")).toBe("ASSIGNED");
    expect(mostSpecific("ASSIGNED", "SUBSCRIBED")).toBe("ASSIGNED");
    expect(mostSpecific("STATE_CHANGED", "MENTIONED")).toBe("MENTIONED");
    expect(mostSpecific("RESOLVED", "STATE_CHANGED")).toBe("RESOLVED");
    // Named personally in a comment that also said @all: the personal reason
    // is the true one, and it's the one that ignores your category toggle.
    expect(mostSpecific("MENTIONED_ALL", "MENTIONED")).toBe("MENTIONED");
    expect(mostSpecific("MENTIONED_ALL", "COMMENTED")).toBe("MENTIONED_ALL");
  });
});

const change = (field: string, fromValue?: string | null, toValue?: string | null) => ({
  field,
  fromValue,
  toValue,
});

describe("classifyReasons", () => {
  it("reads a close as Resolved, for subscribers and the originator", () => {
    expect(
      classifyReasons("FIELDS_CHANGED", [
        change("state", "ANALYZE", "CLOSED"),
        change("substate", "OPEN", "SOFTWARE_CHANGED"),
      ]),
    ).toEqual([
      { reason: "RESOLVED", audience: "subscribers" },
      { reason: "RESOLVED", audience: "originator" },
    ]);
  });

  it("leaves duplicate closures to closeAsDuplicate rather than double-reporting", () => {
    const reasons = classifyReasons("FIELDS_CHANGED", [
      change("state", "ANALYZE", "CLOSED"),
      change("substate", "OPEN", "DUPLICATE"),
    ]);
    expect(reasons.map((r) => r.reason)).not.toContain("RESOLVED");
  });

  it("reads leaving CLOSED as Reopened", () => {
    const reasons = classifyReasons("FIELDS_CHANGED", [
      change("state", "CLOSED", "ANALYZE"),
    ]);
    expect(reasons.map((r) => r.reason)).toEqual(["REOPENED", "REOPENED"]);
  });

  it("treats other state and substate moves as a plain state change", () => {
    expect(
      classifyReasons("FIELDS_CHANGED", [change("state", "ANALYZE", "VERIFY")]),
    ).toEqual([{ reason: "STATE_CHANGED", audience: "subscribers" }]);

    expect(
      classifyReasons("FIELDS_CHANGED", [change("substate", "OPEN", "FIX")]),
    ).toEqual([{ reason: "STATE_CHANGED", audience: "subscribers" }]);
  });

  it("tells the new and previous assignee apart", () => {
    expect(
      classifyReasons("FIELDS_CHANGED", [change("assignee", "user-a", "user-b")]),
    ).toEqual([
      { reason: "ASSIGNED", audience: "assignee" },
      { reason: "UNASSIGNED", audience: "previousAssignee" },
    ]);

    // First assignment: nobody to unassign.
    expect(
      classifyReasons("FIELDS_CHANGED", [change("assignee", null, "user-b")]),
    ).toEqual([{ reason: "ASSIGNED", audience: "assignee" }]);

    // Cleared: nobody to assign.
    expect(
      classifyReasons("FIELDS_CHANGED", [change("assignee", "user-a", null)]),
    ).toEqual([{ reason: "UNASSIGNED", audience: "previousAssignee" }]);
  });

  it("reads the field keys a real diff produces, not hand-written ones", () => {
    // The rest of this suite spells the field names out, so it cannot catch
    // the classifier and the differ disagreeing. diffRadar keys audit entries
    // by label ("assignee"), not by column ("assigneeId"); when the classifier
    // looked for the column name, UNASSIGNED and MILESTONE_CHANGED never fired
    // in production while every test above still passed.
    const changes = diffRadar(
      { assigneeId: "user-a", milestoneId: "m-1" },
      { assigneeId: "user-b", milestoneId: "m-2" },
    );

    const reasons = classifyReasons("FIELDS_CHANGED", changes);
    expect(reasons).toContainEqual({ reason: "ASSIGNED", audience: "assignee" });
    expect(reasons).toContainEqual({
      reason: "UNASSIGNED",
      audience: "previousAssignee",
    });
    expect(reasons).toContainEqual({
      reason: "MILESTONE_CHANGED",
      audience: "subscribers",
    });
  });

  it("only reports priority when it actually goes up in urgency", () => {
    // P3 -> P1 is a raise; the number goes down.
    expect(
      classifyReasons("FIELDS_CHANGED", [change("priority", "3", "1")]).map(
        (r) => r.reason,
      ),
    ).toContain("PRIORITY_RAISED");

    expect(
      classifyReasons("FIELDS_CHANGED", [change("priority", "1", "4")]).map(
        (r) => r.reason,
      ),
    ).not.toContain("PRIORITY_RAISED");
  });

  it("falls back to the catch-all for changes with no sharper reason", () => {
    expect(
      classifyReasons("FIELDS_CHANGED", [change("title", "before", "after")]),
    ).toEqual([{ reason: "SUBSCRIBED", audience: "subscribers" }]);
  });

  it("produces nothing at all when nothing changed", () => {
    expect(classifyReasons("FIELDS_CHANGED", [])).toEqual([]);
  });

  it("maps comment activity to its own reasons", () => {
    expect(classifyReasons("COMMENT_ADDED", [])).toEqual([
      { reason: "COMMENTED", audience: "subscribers" },
    ]);
    expect(classifyReasons("COMMENT_EDITED", [])).toEqual([
      { reason: "COMMENT_EDITED", audience: "subscribers" },
    ]);
  });

  it("stays silent for kinds whose audience the diff cannot describe", () => {
    // Relations and subscriber changes span two radars or name one person;
    // their call sites notify explicitly.
    for (const kind of [
      "RELATION_ADDED",
      "RELATION_REMOVED",
      "SUBSCRIBER_ADDED",
      "SUBSCRIBER_REMOVED",
      "COMMENT_DELETED",
      "RADAR_CREATED",
    ] as const) {
      expect(classifyReasons(kind, [change("title", "a", "b")])).toEqual([]);
    }
  });

  it("keeps assignment and closure separate when they happen in one save", () => {
    const reasons = classifyReasons("FIELDS_CHANGED", [
      change("state", "VERIFY", "CLOSED"),
      change("substate", "VERIFY", "SOFTWARE_CHANGED"),
      change("assignee", "user-a", "user-b"),
    ]);
    expect(reasons).toContainEqual({ reason: "RESOLVED", audience: "subscribers" });
    expect(reasons).toContainEqual({ reason: "ASSIGNED", audience: "assignee" });
    expect(reasons).toContainEqual({
      reason: "UNASSIGNED",
      audience: "previousAssignee",
    });
  });
});
