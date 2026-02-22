/*
  Warnings:

  - You are about to drop the column `thumbnailUrl` on the `files` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "files" DROP COLUMN "thumbnailUrl",
ADD COLUMN     "thumbnailPath" TEXT;
