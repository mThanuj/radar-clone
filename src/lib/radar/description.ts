/**
 * Radar's description is not one blob — it's a fixed set of sections. They
 * live as discrete columns on Radar rather than a child table: a join on
 * every detail render, no per-section text index, and a messier field-diff
 * key space are all worse than hard-coding a stable list.
 *
 * This registry is the single definition shared by the create form, the
 * detail editor, and the canonical plain-text renderer.
 */
export const DESCRIPTION_SECTIONS = [
  {
    key: "summary",
    label: "Summary",
    placeholder: "What happens, in a sentence or two.",
    required: true,
    rows: 5,
  },
  {
    key: "stepsToReproduce",
    label: "Steps to Reproduce",
    placeholder: "1. …\n2. …\n3. …",
    required: false,
    rows: 5,
  },
  {
    key: "expectedResults",
    label: "Expected Results",
    placeholder: "What should have happened.",
    required: false,
    rows: 3,
  },
  {
    key: "actualResults",
    label: "Actual Results",
    placeholder: "What happened instead.",
    required: false,
    rows: 3,
  },
  {
    key: "versionBuild",
    label: "Version / Build",
    placeholder: "e.g. 1.0 (24A335)",
    required: false,
    rows: 2,
  },
  {
    key: "configuration",
    label: "Configuration",
    placeholder: "Hardware, OS, flags — anything needed to reproduce.",
    required: false,
    rows: 3,
  },
  {
    key: "notes",
    label: "Notes",
    placeholder: "Anything else worth recording.",
    required: false,
    rows: 3,
  },
] as const;

export type DescriptionSectionKey = (typeof DESCRIPTION_SECTIONS)[number]["key"];

export const DESCRIPTION_KEYS = DESCRIPTION_SECTIONS.map(
  (s) => s.key,
) as DescriptionSectionKey[];

export type DescriptionValues = Partial<
  Record<DescriptionSectionKey, string | null>
>;

/**
 * The classic pasteable form. Used by "Copy as text" and by anything that
 * needs the whole description as one string.
 */
export function renderCanonicalText(
  radar: DescriptionValues & { number: number; title: string },
): string {
  const parts = [`rdar://problem/${radar.number} — ${radar.title}`, ""];
  for (const section of DESCRIPTION_SECTIONS) {
    const value = radar[section.key];
    if (!value?.trim()) continue;
    parts.push(section.label + ":", value.trim(), "");
  }
  return parts.join("\n").trimEnd() + "\n";
}

export function filledSections(values: DescriptionValues) {
  return DESCRIPTION_SECTIONS.filter((s) => values[s.key]?.trim());
}
