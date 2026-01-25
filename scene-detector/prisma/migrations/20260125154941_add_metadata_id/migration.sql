-- AlterTable
ALTER TABLE "scene_detector"."Scene" ADD COLUMN     "metadataId" TEXT;

-- CreateIndex
CREATE INDEX "Scene_metadataId_idx" ON "scene_detector"."Scene"("metadataId");
