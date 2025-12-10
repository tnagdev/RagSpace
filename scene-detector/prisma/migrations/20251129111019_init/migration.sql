-- CreateTable
CREATE TABLE "scene_detector"."Scene" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sceneNumber" INTEGER NOT NULL,
    "startTime" DOUBLE PRECISION NOT NULL,
    "endTime" DOUBLE PRECISION NOT NULL,
    "startFrame" INTEGER NOT NULL,
    "endFrame" INTEGER NOT NULL,
    "keyframe" INTEGER NOT NULL,
    "duration" DOUBLE PRECISION NOT NULL,
    "thumbnailS3Key" TEXT NOT NULL,
    "thumbnailS3Url" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scene_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Scene_fileId_idx" ON "scene_detector"."Scene"("fileId");

-- CreateIndex
CREATE INDEX "Scene_userId_idx" ON "scene_detector"."Scene"("userId");

-- CreateIndex
CREATE INDEX "Scene_sceneNumber_idx" ON "scene_detector"."Scene"("sceneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Scene_fileId_sceneNumber_key" ON "scene_detector"."Scene"("fileId", "sceneNumber");
