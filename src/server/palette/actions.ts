"use server";

import { requireUser } from "@/server/guards";
import { findRadars } from "@/server/radars/queries";
import { getSavedQueries } from "@/server/saved-queries/queries";

export type PaletteResults = {
  radars: {
    number: number;
    title: string;
    state: string;
    substate: string;
    priority: number;
  }[];
  queries: { id: string; name: string; params: string }[];
};

/** Backs the Cmd+K palette: radar numbers, titles, and saved queries. */
export async function paletteSearchAction(
  term: string,
): Promise<PaletteResults> {
  const user = await requireUser();
  const trimmed = term.trim();

  const [radars, queries] = await Promise.all([
    trimmed ? findRadars(trimmed, 8) : Promise.resolve([]),
    getSavedQueries(user.id),
  ]);

  const needle = trimmed.toLowerCase();
  return {
    radars: radars.map((r) => ({
      number: r.number,
      title: r.title,
      state: r.state,
      substate: r.substate,
      priority: r.priority,
    })),
    queries: queries
      .filter((q) => !needle || q.name.toLowerCase().includes(needle))
      .slice(0, 6)
      .map((q) => ({ id: q.id, name: q.name, params: q.params })),
  };
}
