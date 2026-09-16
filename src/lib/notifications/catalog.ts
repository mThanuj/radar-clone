import type {
  NotificationCategory,
  NotificationReason,
} from "@/generated/prisma/enums";

/**
 * The notification catalog.
 *
 * One entry per reason: which category it belongs to (categories are what users
 * toggle), how it reads, whether it defaults on per channel, and how specific
 * it is. Isomorphic on purpose — the settings UI renders from the same table
 * the server filters on, so a toggle can never mean something different in the
 * two places.
 */

export type ReasonMeta = {
  category: NotificationCategory;
  /** Shown in the inbox and used as the email subject prefix. */
  label: string;
  /** Email template id; see src/server/email/templates.ts. */
  template: string;
  defaultInApp: boolean;
  defaultEmail: boolean;
  /**
   * Bypasses the category toggle and the global mail switch. Only for things
   * a person explicitly did to you by name.
   */
  forced?: boolean;
  /**
   * Tie-break when one mutation produces several reasons for the same person.
   * Lower wins, so "Assigned to you" beats "Radar you follow changed".
   */
  precedence: number;
};

export const REASONS: Record<NotificationReason, ReasonMeta> = {
  // ── Assignment ──────────────────────────────────────────────────────────
  ASSIGNED: {
    category: "ASSIGNMENT",
    label: "Assigned to you",
    template: "assigned",
    defaultInApp: true,
    defaultEmail: true,
    precedence: 10,
  },
  UNASSIGNED: {
    category: "ASSIGNMENT",
    label: "Unassigned from you",
    template: "unassigned",
    defaultInApp: true,
    defaultEmail: true,
    precedence: 11,
  },
  CC_ADDED: {
    category: "ASSIGNMENT",
    label: "You were CC'd",
    template: "cc-added",
    defaultInApp: true,
    defaultEmail: true,
    precedence: 12,
  },
  WATCHING_ADDED: {
    category: "ASSIGNMENT",
    label: "You were added as a watcher",
    template: "watching-added",
    defaultInApp: true,
    defaultEmail: false,
    precedence: 13,
  },

  // ── Discussion ──────────────────────────────────────────────────────────
  MENTIONED: {
    category: "DISCUSSION",
    label: "You were mentioned",
    template: "mentioned",
    defaultInApp: true,
    defaultEmail: true,
    // Someone typed your handle. Staying silent because of a category toggle
    // would be the wrong call.
    forced: true,
    precedence: 5,
  },
  MENTIONED_ALL: {
    category: "DISCUSSION",
    label: "Sent to everyone",
    template: "mentioned-all",
    defaultInApp: true,
    defaultEmail: true,
    // Deliberately *not* forced, unlike MENTIONED. Typing one person's handle
    // earns the right to ignore their category toggle; typing @all would hand
    // that right over every account at once, and the unsubscribe link in the
    // mail has to mean something.
    precedence: 6,
  },
  COMMENTED: {
    category: "DISCUSSION",
    label: "New comment",
    template: "commented",
    defaultInApp: true,
    defaultEmail: true,
    precedence: 30,
  },
  COMMENT_EDITED: {
    category: "DISCUSSION",
    label: "Comment edited",
    template: "comment-edited",
    defaultInApp: true,
    defaultEmail: false,
    precedence: 31,
  },

  // ── Workflow ────────────────────────────────────────────────────────────
  RESOLVED: {
    category: "WORKFLOW",
    label: "Resolved",
    template: "resolved",
    defaultInApp: true,
    defaultEmail: true,
    precedence: 20,
  },
  REOPENED: {
    category: "WORKFLOW",
    label: "Reopened",
    template: "reopened",
    defaultInApp: true,
    defaultEmail: true,
    precedence: 21,
  },
  DUPLICATED: {
    category: "WORKFLOW",
    label: "Marked duplicate",
    template: "duplicated",
    defaultInApp: true,
    defaultEmail: true,
    precedence: 22,
  },
  STATE_CHANGED: {
    category: "WORKFLOW",
    label: "State changed",
    template: "state-changed",
    defaultInApp: true,
    defaultEmail: false,
    precedence: 40,
  },

  // ── Planning ────────────────────────────────────────────────────────────
  BLOCKED: {
    category: "PLANNING",
    label: "Blocked",
    template: "blocked",
    defaultInApp: true,
    defaultEmail: true,
    precedence: 23,
  },
  PRIORITY_RAISED: {
    category: "PLANNING",
    label: "Priority raised",
    template: "priority-raised",
    defaultInApp: true,
    defaultEmail: true,
    precedence: 41,
  },
  DUE_SOON: {
    category: "PLANNING",
    label: "Due soon",
    template: "due-soon",
    defaultInApp: true,
    defaultEmail: true,
    precedence: 24,
  },
  COMPONENT_FILED: {
    category: "PLANNING",
    label: "Filed in your component",
    template: "component-filed",
    defaultInApp: true,
    defaultEmail: false,
    precedence: 25,
  },
  MILESTONE_CHANGED: {
    category: "PLANNING",
    label: "Milestone changed",
    template: "milestone-changed",
    defaultInApp: true,
    defaultEmail: false,
    precedence: 42,
  },
  RELATED: {
    category: "PLANNING",
    label: "Linked to another radar",
    template: "related",
    defaultInApp: true,
    defaultEmail: false,
    precedence: 43,
  },

  // ── Catch-all ───────────────────────────────────────────────────────────
  SUBSCRIBED: {
    category: "PLANNING",
    label: "Radar you follow changed",
    template: "changed",
    defaultInApp: true,
    defaultEmail: false,
    precedence: 90,
  },
};

export const CATEGORIES: Record<
  NotificationCategory,
  { label: string; description: string }
> = {
  ASSIGNMENT: {
    label: "Assignment & CC",
    description: "When work lands on you, leaves you, or you're added to a radar.",
  },
  DISCUSSION: {
    label: "Comments & mentions",
    description:
      "Comments on radars you follow, and @all announcements. Mentions of you by handle always notify, whatever this is set to.",
  },
  WORKFLOW: {
    label: "State & resolution",
    description: "State moves, closures, reopens, and duplicates.",
  },
  PLANNING: {
    label: "Priority, milestones & blockers",
    description:
      "Priority changes, milestone moves, due dates, blockers, and everything else.",
  },
};

export const CATEGORY_ORDER: NotificationCategory[] = [
  "ASSIGNMENT",
  "DISCUSSION",
  "WORKFLOW",
  "PLANNING",
];

export const ALL_REASONS = Object.keys(REASONS) as NotificationReason[];

export function categoryOf(reason: NotificationReason): NotificationCategory {
  return REASONS[reason].category;
}

export function isForced(reason: NotificationReason): boolean {
  return REASONS[reason].forced === true;
}

/** When one mutation yields several reasons for a person, keep the sharpest. */
export function mostSpecific(
  a: NotificationReason,
  b: NotificationReason,
): NotificationReason {
  return REASONS[a].precedence <= REASONS[b].precedence ? a : b;
}
