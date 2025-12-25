-- CreateTable
CREATE TABLE "chat_manager"."Conversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_manager"."Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Conversation_userId_idx" ON "chat_manager"."Conversation"("userId");

-- CreateIndex
CREATE INDEX "Conversation_createdAt_idx" ON "chat_manager"."Conversation"("createdAt");

-- CreateIndex
CREATE INDEX "Message_conversationId_idx" ON "chat_manager"."Message"("conversationId");

-- CreateIndex
CREATE INDEX "Message_timestamp_idx" ON "chat_manager"."Message"("timestamp");

-- AddForeignKey
ALTER TABLE "chat_manager"."Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "chat_manager"."Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
