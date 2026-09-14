import { DESCRIPTION_SECTIONS } from "@/lib/radar/description";
import { RELATION_META } from "@/lib/radar/relations";
import type { RelationType } from "@/generated/prisma/enums";

/**
 * Human labels for audit field keys. Covers more than the search registry:
 * description sections, CC/watcher entries, and `relation.<TYPE>` keys all
 * appear in FieldChange but are not filterable fields.
 */
const EXTRA: Record<string, string> = {
  title: "Title",
  state: "State",
  substate: "Substate",
  classification: "Classification",
  reproducibility: "Reproducibility",
  priority: "Priority",
  component: "Component",
  milestone: "Milestone",
  assignee: "Assignee",
  duplicateOf: "Duplicate of",
  isRegression: "Regression",
  dueDate: "Due date",
  cc: "CC",
  watcher: "Watcher",
};

const SECTION_LABEL = Object.fromEntries(
  DESCRIPTION_SECTIONS.map((s) => [s.key, s.label]),
);

export function auditFieldLabel(field: string): string {
  if (field.startsWith("relation.")) {
    const type = field.slice("relation.".length) as RelationType;
    return RELATION_META[type]?.forward ?? "Relationship";
  }
  return SECTION_LABEL[field] ?? EXTRA[field] ?? field;
}

/** Long-form sections record that they changed, not their full contents. */
export function isProseField(field: string): boolean {
  return field in SECTION_LABEL;
}
