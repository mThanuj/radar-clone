-- Email + real-time notifications.
--
-- Hand-written because `prisma migrate diff --from-migrations` replays into a
-- shadow database, and the schema engine cannot reach Neon through the corp
-- proxy. Applied by scripts/migrate.mjs over the WebSocket driver.
--
-- ALTER TYPE ... ADD VALUE is allowed inside a transaction on PG 12+ provided
-- the new value is not *used* in the same transaction. Nothing here inserts
-- rows with the new values, so this is safe as one implicit transaction.

-- AlterEnum: finer-grained notification reasons
ALTER TYPE "NotificationReason" ADD VALUE IF NOT EXISTS 'UNASSIGNED';
ALTER TYPE "NotificationReason" ADD VALUE IF NOT EXISTS 'WATCHING_ADDED';
ALTER TYPE "NotificationReason" ADD VALUE IF NOT EXISTS 'COMMENT_EDITED';
ALTER TYPE "NotificationReason" ADD VALUE IF NOT EXISTS 'RESOLVED';
ALTER TYPE "NotificationReason" ADD VALUE IF NOT EXISTS 'REOPENED';
ALTER TYPE "NotificationReason" ADD VALUE IF NOT EXISTS 'DUPLICATED';
ALTER TYPE "NotificationReason" ADD VALUE IF NOT EXISTS 'PRIORITY_RAISED';
ALTER TYPE "NotificationReason" ADD VALUE IF NOT EXISTS 'MILESTONE_CHANGED';
ALTER TYPE "NotificationReason" ADD VALUE IF NOT EXISTS 'BLOCKED';
ALTER TYPE "NotificationReason" ADD VALUE IF NOT EXISTS 'RELATED';
ALTER TYPE "NotificationReason" ADD VALUE IF NOT EXISTS 'COMPONENT_FILED';
ALTER TYPE "NotificationReason" ADD VALUE IF NOT EXISTS 'DUE_SOON';

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('ASSIGNMENT', 'DISCUSSION', 'WORKFLOW', 'PLANNING');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "user" ADD COLUMN "emailEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "inApp" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "notificationId" TEXT,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_category_key" ON "NotificationPreference"("userId", "category");

-- CreateIndex: one outbox row per notification — this is what makes redelivery
-- idempotent when the post-response dispatcher and the cron sweep race.
CREATE UNIQUE INDEX "EmailMessage_notificationId_key" ON "EmailMessage"("notificationId");

-- CreateIndex
CREATE INDEX "EmailMessage_status_scheduledFor_idx" ON "EmailMessage"("status", "scheduledFor");

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE SET NULL ON UPDATE CASCADE;
