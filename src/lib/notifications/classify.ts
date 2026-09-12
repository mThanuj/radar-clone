import type {
  ActivityKind,
  NotificationReason,
} from "@/generated/prisma/enums";

/**
 * Turn a field diff into the reasons it should notify under.
 *
 * Pure and table-driven so the whole catalog is testable without a database —
 * which matters, because "did the right person get told the right thing" is
 * exactly the kind of logic that rots silently.
 */

/** Who a reason is aimed at. Resolved to actual users by fanOut. */
export type Audience =
  | "subscribers"
  | "assignee"
  | "previousAssignee"
  | "originator";

export type ClassifiedReason = {
  reason: NotificationReason;
  audience: Audience;
};

export type DiffEntry = {
  field: string;
  fromValue?: string | null;
  toValue?: string | null;
  /** Display snapshots, carried through so emails can read like the feed. */
  fromLabel?: string | null;
  toLabel?: string | null;
};

export function classifyReasons(
  kind: ActivityKind,
  changes: DiffEntry[],
): ClassifiedReason[] {
  const out: ClassifiedReason[] = [];
  const add = (reason: NotificationReason, audience: Audience = "subscribers") =>
    out.push({ reason, audience });

  switch (kind) {
    case "RADAR_CREATED":
      // The assignee is told directly by the caller; subscribers of a brand new
      // radar are only ever the originator and assignee, so there is no
      // broadcast reason here.
      return out;
    case "COMMENT_ADDED":
      add("COMMENTED");
      return out;
    case "COMMENT_EDITED":
      add("COMMENT_EDITED");
      return out;
    case "COMMENT_DELETED":
    case "SUBSCRIBER_ADDED":
    case "SUBSCRIBER_REMOVED":
    case "RELATION_ADDED":
    case "RELATION_REMOVED":
    case "KEYWORD_ADDED":
    case "KEYWORD_REMOVED":
      // Cross-radar and subscriber events name their recipients explicitly at
      // the call site, because the audience isn't derivable from the diff.
      return out;
    default:
      break;
  }

  const byField = new Map(changes.map((c) => [c.field, c]));

  const state = byField.get("state");
  if (state) {
    if (state.toValue === "CLOSED") {
      // A duplicate closure is reported by closeAsDuplicate, which knows about
      // both radars; don't double up.
      const substate = byField.get("substate");
      if (substate?.toValue !== "DUPLICATE") {
        add("RESOLVED");
        add("RESOLVED", "originator");
      }
    } else if (state.fromValue === "CLOSED") {
      add("REOPENED");
      add("REOPENED", "originator");
    } else {
      add("STATE_CHANGED");
    }
  } else if (byField.has("substate")) {
    add("STATE_CHANGED");
  }

  const assignee = byField.get("assigneeId");
  if (assignee) {
    if (assignee.toValue) add("ASSIGNED", "assignee");
    if (assignee.fromValue) add("UNASSIGNED", "previousAssignee");
  }

  const priority = byField.get("priority");
  if (priority) {
    const from = Number(priority.fromValue);
    const to = Number(priority.toValue);
    // Priority 1 is the most urgent, so "raised" means the number went down.
    if (Number.isFinite(from) && Number.isFinite(to) && to < from) {
      add("PRIORITY_RAISED");
    }
  }

  if (byField.has("milestoneId")) add("MILESTONE_CHANGED");

  // Anything audited that produced no sharper reason still deserves a line in
  // the inbox for people watching the radar.
  if (out.length === 0 && changes.length > 0) add("SUBSCRIBED");

  return out;
}
