-- Remove the per-component version list.
--
-- The feature was never used: nothing set a Radar's version beyond the
-- create form's dropdown, and the vocabulary was seeded rather than curated.
-- Dropping the column loses whichever versions were recorded; that is the
-- point of the change, not a side effect of it.

ALTER TABLE "Radar" DROP COLUMN IF EXISTS "componentVersionId";

DROP TABLE IF EXISTS "ComponentVersion";
