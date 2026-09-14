-- Remove schema nothing can reach.
--
-- Each item below was checked in both directions before removal: no code path
-- writes it, and no code path reads it. Evidence per item is in the commit
-- message. Nothing here is a behaviour change, because none of it could
-- affect behaviour.

-- Comment threading. There was never a reply control, so parentId was always
-- null and the self-relation never had a second level.
ALTER TABLE "Comment" DROP COLUMN IF EXISTS "parentId";

-- Written on every comment, read from nowhere. The mention notification is
-- raised from extractMentions() at write time, not from this table.
DROP TABLE IF EXISTS "CommentMention";

-- Audited and patchable, but no UI ever set it and nothing displayed it. It
-- was not in the search registry either, so it could not even be filtered on.
ALTER TABLE "Radar" DROP COLUMN IF EXISTS "fixedInBuild";

-- Accepted by the keyword admin action, rendered nowhere.
ALTER TABLE "Keyword" DROP COLUMN IF EXISTS "color";

-- Accepted by the milestone action, displayed on no page. targetDate, which
-- is both editable and displayed, stays.
ALTER TABLE "Milestone" DROP COLUMN IF EXISTS "startsAt";
ALTER TABLE "Milestone" DROP COLUMN IF EXISTS "completedAt";

-- Accepted by the component action, displayed on no page.
ALTER TABLE "Component" DROP COLUMN IF EXISTS "description";

-- Two kinds no writer ever produced: keyword edits are recorded as
-- FIELDS_CHANGED carrying a "keyword" field. Postgres cannot drop a value from
-- an enum, so the type is rebuilt. The cast fails loudly rather than silently
-- if a row somehow holds one; dependent indexes are rebuilt automatically.
ALTER TYPE "ActivityKind" RENAME TO "ActivityKind_dead";
CREATE TYPE "ActivityKind" AS ENUM ('RADAR_CREATED', 'FIELDS_CHANGED', 'COMMENT_ADDED', 'COMMENT_EDITED', 'COMMENT_DELETED', 'RELATION_ADDED', 'RELATION_REMOVED', 'SUBSCRIBER_ADDED', 'SUBSCRIBER_REMOVED');
ALTER TABLE "ActivityEvent" ALTER COLUMN "kind" TYPE "ActivityKind" USING "kind"::text::"ActivityKind";
DROP TYPE "ActivityKind_dead";

-- Same treatment for a status nothing ever set. The DEFAULT has to come off
-- and go back on, because it is typed by the enum being replaced.
ALTER TYPE "EmailStatus" RENAME TO "EmailStatus_dead";
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');
ALTER TABLE "EmailMessage" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "EmailMessage" ALTER COLUMN "status" TYPE "EmailStatus" USING "status"::text::"EmailStatus";
ALTER TABLE "EmailMessage" ALTER COLUMN "status" SET DEFAULT 'PENDING';
DROP TYPE "EmailStatus_dead";
