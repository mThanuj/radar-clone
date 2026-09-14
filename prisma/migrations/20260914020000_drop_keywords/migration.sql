-- Remove keywords.
--
-- Unused, per the owner. They were free-form tags with a shared vocabulary,
-- searchable and auditable but load-bearing for nothing: no logic read them,
-- so removing them cannot change any behaviour beyond taking the filter, the
-- column and the pickers away.
--
-- The join table goes first; both are dropped outright rather than detached,
-- so whatever tags a deployment recorded go with them.

DROP TABLE IF EXISTS "RadarKeyword";
DROP TABLE IF EXISTS "Keyword";
