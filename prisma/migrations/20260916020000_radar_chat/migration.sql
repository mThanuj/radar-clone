-- Private per-radar chat.
--
-- Two tables, no enum change. Hand-written like every migration here: the
-- schema engine's shadow database is unreachable through the proxy, so this is
-- applied by scripts/migrate.mjs over the WebSocket driver. Column order
-- matches schema.prisma so `npm run db:diff` reports no drift.
--
-- Hard delete, unlike Comment. Chat is not the audit record, and a second
-- soft-deleted table means a second read path that has to remember
-- `deletedAt IS NULL` by hand — a missed filter on Comment shows a dead
-- comment, a missed one here leaks private text.

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "radarId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatRead" (
    "id" TEXT NOT NULL,
    "radarId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatRead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: the page read is "this radar, newest first" and the unread
-- count is the same prefix with a range on createdAt — one index serves both.
CREATE INDEX "ChatMessage_radarId_createdAt_idx" ON "ChatMessage"("radarId", "createdAt");

-- CreateIndex: one marker per person per radar; also the upsert target.
CREATE UNIQUE INDEX "ChatRead_radarId_userId_key" ON "ChatRead"("radarId", "userId");

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_radarId_fkey" FOREIGN KEY ("radarId") REFERENCES "Radar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Restrict, like Comment — accounts are deactivated rather than
-- deleted, and authorship must not silently become null.
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRead" ADD CONSTRAINT "ChatRead_radarId_fkey" FOREIGN KEY ("radarId") REFERENCES "Radar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: a read marker is disposable state, so it follows the account
-- out rather than holding it back.
ALTER TABLE "ChatRead" ADD CONSTRAINT "ChatRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
