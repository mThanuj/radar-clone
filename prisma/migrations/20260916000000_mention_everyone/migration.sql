-- @all in a comment.
--
-- Its own reason rather than reusing MENTIONED: MENTIONED is forced, so it
-- bypasses the category toggle and the global mail switch. That is right for
-- someone typing your handle and wrong for a broadcast — otherwise one person
-- can override every account's notification preferences at once.
--
-- AFTER 'MENTIONED' so the type's value order matches the enum in
-- schema.prisma and a later `migrate diff` reports no drift.

ALTER TYPE "NotificationReason"
  ADD VALUE IF NOT EXISTS 'MENTIONED_ALL' AFTER 'MENTIONED';
