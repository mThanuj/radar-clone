import "server-only";
import type { db } from "@/lib/db";

/**
 * The interactive-transaction client. Every function that participates in an
 * audited mutation takes this rather than importing `db` directly, so it is
 * impossible to accidentally run half a mutation outside the transaction.
 */
export type Tx = Omit<
  typeof db,
  "$connect" | "$disconnect" | "$transaction" | "$extends"
>;
