-- Helpers: people working a radar alongside its assignee.
--
-- A third SubscriberRole rather than a new table or a column on Radar. A
-- helper follows the radar by definition, so reusing RadarSubscriber hands the
-- feature per-person mute, notification fan-out and the SUBSCRIBER_ADDED /
-- SUBSCRIBER_REMOVED audit trail without a line of new plumbing — and the
-- (radarId, userId, role) unique constraint already says a person helps a
-- radar at most once.
--
-- Positioned to match the enums in schema.prisma so a later `migrate diff`
-- reports no drift: HELPER at the end of SubscriberRole, HELPER_ADDED between
-- the two assignment reasons it sits between in the catalog.

ALTER TYPE "SubscriberRole" ADD VALUE IF NOT EXISTS 'HELPER';

ALTER TYPE "NotificationReason"
  ADD VALUE IF NOT EXISTS 'HELPER_ADDED' AFTER 'UNASSIGNED';
