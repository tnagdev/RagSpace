-- AlterTable
ALTER TABLE "chat_manager"."Message" ADD COLUMN     "fileIds" TEXT[],
ADD COLUMN     "searchResults" JSONB;
