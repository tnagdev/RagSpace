-- CreateEnum
CREATE TYPE "MetadataSourceType" AS ENUM ('IMAGE', 'VIDEO', 'SCENE');

-- CreateTable
CREATE TABLE "file_metadata" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "sceneId" TEXT,
    "sourceType" "MetadataSourceType" NOT NULL,
    "summary" TEXT,
    "objects" TEXT[],
    "setting" TEXT,
    "style" TEXT,
    "colors" TEXT[],
    "rawResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "file_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "file_metadata_fileId_idx" ON "file_metadata"("fileId");

-- CreateIndex
CREATE INDEX "file_metadata_sceneId_idx" ON "file_metadata"("sceneId");

-- CreateIndex
CREATE INDEX "file_metadata_sourceType_idx" ON "file_metadata"("sourceType");

-- CreateIndex
CREATE UNIQUE INDEX "file_metadata_fileId_sceneId_key" ON "file_metadata"("fileId", "sceneId");

-- AddForeignKey
ALTER TABLE "file_metadata" ADD CONSTRAINT "file_metadata_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
