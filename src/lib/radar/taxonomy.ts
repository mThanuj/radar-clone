import type {
  ActivityKind,
  Classification,
  MilestoneStatus,
  RadarState,
  RadarSubstate,
  Reproducibility,
  SubscriberRole,
} from "@/generated/prisma/enums";

/**
 * Display vocabulary for every enum in the schema. Badges take a `tone`
 * rather than raw Tailwind classes so the palette stays in one place
 * (see <Badge> in components/ui/badge.tsx) and light/dark stay in sync.
 */
export type Tone =
  | "gray"
  | "slate"
  | "blue"
  | "violet"
  | "amber"
  | "red"
  | "green";

export const STATE_LABEL: Record<RadarState, string> = {
  ANALYZE: "Analyze",
  INTEGRATE: "Integrate",
  VERIFY: "Verify",
  CLOSED: "Closed",
};

export const STATE_TONE: Record<RadarState, Tone> = {
  ANALYZE: "blue",
  INTEGRATE: "violet",
  VERIFY: "amber",
  CLOSED: "gray",
};

export const SUBSTATE_LABEL: Record<RadarSubstate, string> = {
  OPEN: "Open",
  ANALYZE: "Analyze",
  INVESTIGATE: "Investigate",
  FIX: "Fix",
  INTEGRATE: "Integrate",
  VERIFY: "Verify",
  SOFTWARE_CHANGED: "Software Changed",
  DUPLICATE: "Duplicate",
  BEHAVES_CORRECTLY: "Behaves Correctly",
  UNABLE_TO_REPRODUCE: "Unable To Reproduce",
  INSUFFICIENT_INFORMATION: "Insufficient Information",
  NOT_TO_BE_FIXED: "Not To Be Fixed",
  WONT_FIX: "Won't Fix",
  NO_ACTION: "No Action",
  THIRD_PARTY_TO_RESOLVE: "Third Party To Resolve",
  WITHDRAWN: "Withdrawn",
};

export const CLASSIFICATION_LABEL: Record<Classification, string> = {
  SECURITY: "Security",
  CRASH_HANG_DATA_LOSS: "Crash / Hang / Data Loss",
  POWER: "Power",
  PERFORMANCE: "Performance",
  UI_USABILITY: "UI / Usability",
  SERIOUS_BUG: "Serious Bug",
  OTHER_BUG: "Other Bug",
  FEATURE_NEW: "Feature (New)",
  ENHANCEMENT: "Enhancement",
  TASK: "Task",
  QUESTION: "Question",
  OTHER: "Other",
};

/** Order shown in pickers — severity first, then work types. */
export const CLASSIFICATION_ORDER: Classification[] = [
  "SECURITY",
  "CRASH_HANG_DATA_LOSS",
  "SERIOUS_BUG",
  "OTHER_BUG",
  "PERFORMANCE",
  "POWER",
  "UI_USABILITY",
  "FEATURE_NEW",
  "ENHANCEMENT",
  "TASK",
  "QUESTION",
  "OTHER",
];

export const CLASSIFICATION_TONE: Record<Classification, Tone> = {
  SECURITY: "red",
  CRASH_HANG_DATA_LOSS: "red",
  POWER: "amber",
  PERFORMANCE: "amber",
  UI_USABILITY: "blue",
  SERIOUS_BUG: "red",
  OTHER_BUG: "slate",
  FEATURE_NEW: "green",
  ENHANCEMENT: "green",
  TASK: "violet",
  QUESTION: "slate",
  OTHER: "gray",
};

export const REPRODUCIBILITY_LABEL: Record<Reproducibility, string> = {
  ALWAYS: "Always",
  SOMETIMES: "Sometimes",
  RARELY: "Rarely",
  UNABLE: "Unable",
  DID_NOT_TRY: "Did Not Try",
  NOT_APPLICABLE: "Not Applicable",
};

export const REPRODUCIBILITY_ORDER: Reproducibility[] = [
  "ALWAYS",
  "SOMETIMES",
  "RARELY",
  "UNABLE",
  "DID_NOT_TRY",
  "NOT_APPLICABLE",
];

export const PRIORITIES = [1, 2, 3, 4, 5] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABEL: Record<number, string> = {
  1: "P1 — Critical",
  2: "P2 — High",
  3: "P3 — Medium",
  4: "P4 — Low",
  5: "P5 — Trivial",
};

export const PRIORITY_SHORT: Record<number, string> = {
  1: "P1",
  2: "P2",
  3: "P3",
  4: "P4",
  5: "P5",
};

export const PRIORITY_TONE: Record<number, Tone> = {
  1: "red",
  2: "amber",
  3: "blue",
  4: "slate",
  5: "gray",
};

export const MILESTONE_STATUS_LABEL: Record<MilestoneStatus, string> = {
  PLANNED: "Planned",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const MILESTONE_STATUS_TONE: Record<MilestoneStatus, Tone> = {
  PLANNED: "slate",
  ACTIVE: "blue",
  COMPLETED: "green",
  CANCELLED: "gray",
};

export const SUBSCRIBER_ROLE_LABEL: Record<SubscriberRole, string> = {
  CC: "CC",
  WATCHER: "Watcher",
};

export const ACTIVITY_KIND_LABEL: Record<ActivityKind, string> = {
  RADAR_CREATED: "filed this radar",
  FIELDS_CHANGED: "made changes",
  COMMENT_ADDED: "commented",
  COMMENT_EDITED: "edited a comment",
  COMMENT_DELETED: "deleted a comment",
  RELATION_ADDED: "added a relationship",
  RELATION_REMOVED: "removed a relationship",
  SUBSCRIBER_ADDED: "changed subscribers",
  SUBSCRIBER_REMOVED: "changed subscribers",
  KEYWORD_ADDED: "changed keywords",
  KEYWORD_REMOVED: "changed keywords",
};

