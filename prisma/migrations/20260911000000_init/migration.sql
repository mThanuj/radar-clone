-- Hand-edited additions that prisma migrate diff cannot generate.
-- The sequence MUST be created before CREATE TABLE "Radar", whose "number"
-- column defaults to nextval() on it.

-- CreateSequence
CREATE SEQUENCE IF NOT EXISTS radar_number_seq START WITH 100000000 INCREMENT BY 1;

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RadarState" AS ENUM ('ANALYZE', 'INTEGRATE', 'VERIFY', 'CLOSED');

-- CreateEnum
CREATE TYPE "RadarSubstate" AS ENUM ('OPEN', 'ANALYZE', 'INVESTIGATE', 'FIX', 'INTEGRATE', 'VERIFY', 'SOFTWARE_CHANGED', 'DUPLICATE', 'BEHAVES_CORRECTLY', 'UNABLE_TO_REPRODUCE', 'INSUFFICIENT_INFORMATION', 'NOT_TO_BE_FIXED', 'WONT_FIX', 'NO_ACTION', 'THIRD_PARTY_TO_RESOLVE', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "Classification" AS ENUM ('SECURITY', 'CRASH_HANG_DATA_LOSS', 'POWER', 'PERFORMANCE', 'UI_USABILITY', 'SERIOUS_BUG', 'OTHER_BUG', 'FEATURE_NEW', 'ENHANCEMENT', 'TASK', 'QUESTION', 'OTHER');

-- CreateEnum
CREATE TYPE "Reproducibility" AS ENUM ('ALWAYS', 'SOMETIMES', 'RARELY', 'UNABLE', 'DID_NOT_TRY', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "RelationType" AS ENUM ('DUPLICATE_OF', 'RELATED_TO', 'BLOCKS', 'PARENT_OF', 'CLONE_OF', 'CAUSED_BY');

-- CreateEnum
CREATE TYPE "SubscriberRole" AS ENUM ('CC', 'WATCHER');

-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QueryVisibility" AS ENUM ('PRIVATE', 'SHARED');

-- CreateEnum
CREATE TYPE "ActivityKind" AS ENUM ('RADAR_CREATED', 'FIELDS_CHANGED', 'COMMENT_ADDED', 'COMMENT_EDITED', 'COMMENT_DELETED', 'RELATION_ADDED', 'RELATION_REMOVED', 'SUBSCRIBER_ADDED', 'SUBSCRIBER_REMOVED', 'KEYWORD_ADDED', 'KEYWORD_REMOVED');

-- CreateEnum
CREATE TYPE "NotificationReason" AS ENUM ('ASSIGNED', 'CC_ADDED', 'MENTIONED', 'COMMENTED', 'STATE_CHANGED', 'SUBSCRIBED');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "handle" TEXT NOT NULL,
    "jobTitle" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "idToken" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Component" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "path" TEXT NOT NULL,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "defaultAssigneeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Component_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComponentVersion" (
    "id" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ComponentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "componentId" TEXT,
    "status" "MilestoneStatus" NOT NULL DEFAULT 'PLANNED',
    "startsAt" TIMESTAMP(3),
    "targetDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Keyword" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Keyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadarKeyword" (
    "radarId" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "addedById" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RadarKeyword_pkey" PRIMARY KEY ("radarId","keywordId")
);

-- CreateTable
CREATE TABLE "Radar" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL DEFAULT nextval('radar_number_seq'),
    "version" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "stepsToReproduce" TEXT,
    "expectedResults" TEXT,
    "actualResults" TEXT,
    "versionBuild" TEXT,
    "configuration" TEXT,
    "notes" TEXT,
    "classification" "Classification" NOT NULL,
    "reproducibility" "Reproducibility" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "priority" SMALLINT NOT NULL DEFAULT 3,
    "state" "RadarState" NOT NULL DEFAULT 'ANALYZE',
    "substate" "RadarSubstate" NOT NULL DEFAULT 'OPEN',
    "isRegression" BOOLEAN NOT NULL DEFAULT false,
    "fixedInBuild" TEXT,
    "componentId" TEXT NOT NULL,
    "componentVersionId" TEXT,
    "milestoneId" TEXT,
    "originatorId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "duplicateOfId" TEXT,
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "stateChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Radar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadarSubscriber" (
    "id" TEXT NOT NULL,
    "radarId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "SubscriberRole" NOT NULL,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "addedById" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RadarSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadarRelation" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "type" "RelationType" NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RadarRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "radarId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "parentId" TEXT,
    "body" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentMention" (
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "CommentMention_pkey" PRIMARY KEY ("commentId","userId")
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL,
    "radarId" TEXT NOT NULL,
    "actorId" TEXT,
    "kind" "ActivityKind" NOT NULL,
    "note" TEXT,
    "commentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldChange" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT,
    "fromLabel" TEXT,
    "toLabel" TEXT,

    CONSTRAINT "FieldChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedQuery" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "params" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "visibility" "QueryVisibility" NOT NULL DEFAULT 'PRIVATE',
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "icon" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "radarId" TEXT NOT NULL,
    "eventId" TEXT,
    "reason" "NotificationReason" NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_handle_key" ON "user"("handle");

-- CreateIndex
CREATE INDEX "user_name_idx" ON "user"("name");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "account_providerId_accountId_key" ON "account"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "Component_path_key" ON "Component"("path");

-- CreateIndex
CREATE INDEX "Component_path_idx" ON "Component"("path");

-- CreateIndex
CREATE UNIQUE INDEX "Component_parentId_name_key" ON "Component"("parentId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ComponentVersion_componentId_name_key" ON "ComponentVersion"("componentId", "name");

-- CreateIndex
CREATE INDEX "Milestone_status_targetDate_idx" ON "Milestone"("status", "targetDate");

-- CreateIndex
CREATE UNIQUE INDEX "Milestone_componentId_name_key" ON "Milestone"("componentId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Keyword_name_key" ON "Keyword"("name");

-- CreateIndex
CREATE INDEX "RadarKeyword_keywordId_idx" ON "RadarKeyword"("keywordId");

-- CreateIndex
CREATE UNIQUE INDEX "Radar_number_key" ON "Radar"("number");

-- CreateIndex
CREATE INDEX "Radar_state_substate_idx" ON "Radar"("state", "substate");

-- CreateIndex
CREATE INDEX "Radar_assigneeId_state_idx" ON "Radar"("assigneeId", "state");

-- CreateIndex
CREATE INDEX "Radar_componentId_state_idx" ON "Radar"("componentId", "state");

-- CreateIndex
CREATE INDEX "Radar_milestoneId_state_idx" ON "Radar"("milestoneId", "state");

-- CreateIndex
CREATE INDEX "Radar_originatorId_state_idx" ON "Radar"("originatorId", "state");

-- CreateIndex
CREATE INDEX "Radar_priority_lastActivityAt_idx" ON "Radar"("priority", "lastActivityAt" DESC);

-- CreateIndex
CREATE INDEX "Radar_lastActivityAt_idx" ON "Radar"("lastActivityAt" DESC);

-- CreateIndex
CREATE INDEX "Radar_duplicateOfId_idx" ON "Radar"("duplicateOfId");

-- CreateIndex
CREATE INDEX "RadarSubscriber_userId_role_idx" ON "RadarSubscriber"("userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "RadarSubscriber_radarId_userId_role_key" ON "RadarSubscriber"("radarId", "userId", "role");

-- CreateIndex
CREATE INDEX "RadarRelation_targetId_type_idx" ON "RadarRelation"("targetId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "RadarRelation_sourceId_targetId_type_key" ON "RadarRelation"("sourceId", "targetId", "type");

-- CreateIndex
CREATE INDEX "Comment_radarId_createdAt_idx" ON "Comment"("radarId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");

-- CreateIndex
CREATE INDEX "CommentMention_userId_idx" ON "CommentMention"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityEvent_commentId_key" ON "ActivityEvent"("commentId");

-- CreateIndex
CREATE INDEX "ActivityEvent_radarId_createdAt_idx" ON "ActivityEvent"("radarId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_createdAt_idx" ON "ActivityEvent"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "ActivityEvent_actorId_createdAt_idx" ON "ActivityEvent"("actorId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ActivityEvent_kind_createdAt_idx" ON "ActivityEvent"("kind", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "FieldChange_eventId_idx" ON "FieldChange"("eventId");

-- CreateIndex
CREATE INDEX "FieldChange_field_toValue_idx" ON "FieldChange"("field", "toValue");

-- CreateIndex
CREATE INDEX "SavedQuery_visibility_sortOrder_idx" ON "SavedQuery"("visibility", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "SavedQuery_ownerId_name_key" ON "SavedQuery"("ownerId", "name");

-- CreateIndex
CREATE INDEX "Notification_recipientId_readAt_createdAt_idx" ON "Notification"("recipientId", "readAt", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Component" ADD CONSTRAINT "Component_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Component"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Component" ADD CONSTRAINT "Component_defaultAssigneeId_fkey" FOREIGN KEY ("defaultAssigneeId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComponentVersion" ADD CONSTRAINT "ComponentVersion_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Component"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Component"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadarKeyword" ADD CONSTRAINT "RadarKeyword_radarId_fkey" FOREIGN KEY ("radarId") REFERENCES "Radar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadarKeyword" ADD CONSTRAINT "RadarKeyword_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "Keyword"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadarKeyword" ADD CONSTRAINT "RadarKeyword_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Radar" ADD CONSTRAINT "Radar_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Component"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Radar" ADD CONSTRAINT "Radar_componentVersionId_fkey" FOREIGN KEY ("componentVersionId") REFERENCES "ComponentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Radar" ADD CONSTRAINT "Radar_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Radar" ADD CONSTRAINT "Radar_originatorId_fkey" FOREIGN KEY ("originatorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Radar" ADD CONSTRAINT "Radar_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Radar" ADD CONSTRAINT "Radar_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "Radar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadarSubscriber" ADD CONSTRAINT "RadarSubscriber_radarId_fkey" FOREIGN KEY ("radarId") REFERENCES "Radar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadarSubscriber" ADD CONSTRAINT "RadarSubscriber_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadarSubscriber" ADD CONSTRAINT "RadarSubscriber_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadarRelation" ADD CONSTRAINT "RadarRelation_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Radar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadarRelation" ADD CONSTRAINT "RadarRelation_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Radar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadarRelation" ADD CONSTRAINT "RadarRelation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_radarId_fkey" FOREIGN KEY ("radarId") REFERENCES "Radar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentMention" ADD CONSTRAINT "CommentMention_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentMention" ADD CONSTRAINT "CommentMention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_radarId_fkey" FOREIGN KEY ("radarId") REFERENCES "Radar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldChange" ADD CONSTRAINT "FieldChange_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ActivityEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedQuery" ADD CONSTRAINT "SavedQuery_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_radarId_fkey" FOREIGN KEY ("radarId") REFERENCES "Radar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Hand-edited: constraints and indexes Prisma cannot express ───

-- Tie the sequence lifetime to the column it feeds.
ALTER SEQUENCE radar_number_seq OWNED BY "Radar"."number";

-- Priority is a smallint so range scans work; keep it honest.
ALTER TABLE "Radar" ADD CONSTRAINT radar_priority_range CHECK ("priority" BETWEEN 1 AND 5);
ALTER TABLE "Radar" ADD CONSTRAINT radar_not_own_duplicate CHECK ("duplicateOfId" IS DISTINCT FROM "id");
ALTER TABLE "RadarRelation" ADD CONSTRAINT relation_no_self CHECK ("sourceId" <> "targetId");

-- Trigram indexes back the ILIKE text search in lib/search/to-prisma.ts.
CREATE INDEX radar_title_trgm ON "Radar" USING GIN ("title" gin_trgm_ops);
CREATE INDEX radar_summary_trgm ON "Radar" USING GIN ("summary" gin_trgm_ops);

-- Hot path: every default queue excludes closed radars.
CREATE INDEX radar_open_idx ON "Radar" ("state", "priority", "lastActivityAt" DESC)
  WHERE "state" <> 'CLOSED';
