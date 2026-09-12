import type { Prisma } from "@/generated/prisma/client";
import { FIELDS } from "@/lib/search/fields";
import type { QueryContext, RadarQuery } from "@/lib/search/types";

/**
 * Free-text search is ILIKE over the pg_trgm GIN indexes, not a tsvector
 * column. A generated tsvector would force the text predicate into raw SQL,
 * which forces the *whole* list query into raw SQL — you cannot AND a raw
 * fragment into a Prisma where — duplicating the entire filter mapper.
 * ILIKE composes, and at personal-tracker scale the trigram index keeps it
 * fast. If ranking is ever needed, rewrite searchRadars internally; the
 * signature stays the same.
 */
function textWhere(text: string): Prisma.RadarWhereInput {
  const numeric = /^\d+$/.test(text);
  return {
    OR: [
      { title: { contains: text, mode: "insensitive" } },
      { summary: { contains: text, mode: "insensitive" } },
      { stepsToReproduce: { contains: text, mode: "insensitive" } },
      { actualResults: { contains: text, mode: "insensitive" } },
      { notes: { contains: text, mode: "insensitive" } },
      { comments: { some: { bodyText: { contains: text, mode: "insensitive" } } } },
      ...(numeric ? [{ number: Number(text) }] : []),
    ],
  };
}

export function toPrismaWhere(
  query: RadarQuery,
  ctx: QueryContext,
): Prisma.RadarWhereInput {
  const and: Prisma.RadarWhereInput[] = query.conditions.map((condition) =>
    FIELDS[condition.field].toWhere(condition, ctx),
  );

  if (query.text) and.push(textWhere(query.text));

  return and.length ? { AND: and } : {};
}

export function toPrismaOrderBy(
  query: RadarQuery,
): Prisma.RadarOrderByWithRelationInput[] {
  const orderBy = query.sort
    .map((s) => FIELDS[s.field].orderBy?.(s.dir))
    .filter((o): o is Prisma.RadarOrderByWithRelationInput => Boolean(o));

  // Stable tiebreak, otherwise pagination can repeat or skip rows when the
  // sort key has duplicates.
  orderBy.push({ number: "desc" });
  return orderBy;
}
