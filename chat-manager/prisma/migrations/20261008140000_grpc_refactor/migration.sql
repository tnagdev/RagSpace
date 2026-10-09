-- AlterTable
ALTER TABLE "chat_manager"."Conversation" ADD COLUMN     "summarizedUntil" TIMESTAMP(3),
ADD COLUMN     "requestId" TEXT,
ADD COLUMN     "messageCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastMessagePreview" TEXT;

-- AlterTable
ALTER TABLE "chat_manager"."Message" ADD COLUMN     "toolsUsed" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "requestId" TEXT,
ADD COLUMN     "replyToId" TEXT;

-- Backfill denormalized conversation stats
UPDATE "chat_manager"."Conversation" c
SET "messageCount" = s.count
FROM (SELECT "conversationId", COUNT(*)::INTEGER AS count FROM "chat_manager"."Message" GROUP BY "conversationId") s
WHERE s."conversationId" = c."id";

UPDATE "chat_manager"."Conversation" c
SET "lastMessagePreview" = LEFT(m."content", 100)
FROM (
    SELECT DISTINCT ON ("conversationId") "conversationId", "content"
    FROM "chat_manager"."Message"
    ORDER BY "conversationId", "timestamp" DESC
) m
WHERE m."conversationId" = c."id";

-- DropIndex
DROP INDEX "chat_manager"."Conversation_userId_idx";
DROP INDEX "chat_manager"."Conversation_createdAt_idx";
DROP INDEX "chat_manager"."Conversation_fileId_idx";
DROP INDEX "chat_manager"."Conversation_collectionId_idx";
DROP INDEX "chat_manager"."Message_conversationId_idx";
DROP INDEX "chat_manager"."Message_timestamp_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_userId_requestId_key" ON "chat_manager"."Conversation"("userId", "requestId");
CREATE INDEX "Conversation_userId_updatedAt_idx" ON "chat_manager"."Conversation"("userId", "updatedAt");
CREATE UNIQUE INDEX "Message_conversationId_requestId_key" ON "chat_manager"."Message"("conversationId", "requestId");
CREATE INDEX "Message_conversationId_timestamp_idx" ON "chat_manager"."Message"("conversationId", "timestamp");
CREATE INDEX "Message_replyToId_idx" ON "chat_manager"."Message"("replyToId");
