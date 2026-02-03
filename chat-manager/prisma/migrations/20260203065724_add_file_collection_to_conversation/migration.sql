-- AlterTable
ALTER TABLE "chat_manager"."Conversation" ADD COLUMN     "collectionId" TEXT,
ADD COLUMN     "fileId" TEXT;

-- CreateIndex
CREATE INDEX "Conversation_fileId_idx" ON "chat_manager"."Conversation"("fileId");

-- CreateIndex
CREATE INDEX "Conversation_collectionId_idx" ON "chat_manager"."Conversation"("collectionId");

-- CreateIndex
CREATE INDEX "Conversation_userId_fileId_idx" ON "chat_manager"."Conversation"("userId", "fileId");

-- CreateIndex
CREATE INDEX "Conversation_userId_collectionId_idx" ON "chat_manager"."Conversation"("userId", "collectionId");
