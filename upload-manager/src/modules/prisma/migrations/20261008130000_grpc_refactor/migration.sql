ALTER TABLE "files" ALTER COLUMN "fileSize" SET DATA TYPE BIGINT;

ALTER TABLE "files" ADD COLUMN "multipartUploadId" TEXT;

ALTER TABLE "files" ADD COLUMN "clientRequestId" TEXT;

CREATE UNIQUE INDEX "files_userId_clientRequestId_key" ON "files"("userId", "clientRequestId");

UPDATE "files"
SET "multipartUploadId" = "metadata"->>'uploadId',
    "metadata" = "metadata" - 'uploadId' - 'chunkSize' - 'totalChunks'
WHERE "metadata" ? 'uploadId';

CREATE INDEX "files_userId_createdAt_idx" ON "files"("userId", "createdAt");

CREATE INDEX "files_processingStage_idx" ON "files"("processingStage");

CREATE INDEX "files_fileType_idx" ON "files"("fileType");

CREATE INDEX "collections_userId_name_idx" ON "collections"("userId", "name");