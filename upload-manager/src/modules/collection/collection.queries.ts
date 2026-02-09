import { Prisma } from '@prisma/client';

/**
 * SQL query to fetch paginated collection items (both child collections and files)
 * with complete data in a single query using UNION ALL
 * 
 * @param collectionId - The parent collection ID
 * @param limit - Number of items per page
 * @param offset - Number of items to skip
 * @returns Parameterized SQL query
 */
export const getCollectionItemsQuery = (
    collectionId: string,
    limit: number,
    offset: number,
) => {
    return Prisma.sql`
        SELECT *,
            COUNT(*) OVER()::int AS total
        FROM (
            -- COLLECTIONS
            SELECT
                'collection' AS type,
                c.id,
                c."userId",
                c.name,
                c.description,
                c.color,
                c."parentId",
                c."createdAt",
                c."updatedAt",
                (SELECT COUNT(*)::int FROM "upload"."collections" WHERE "parentId" = c.id) AS "childrenCount",
                (SELECT COUNT(*)::int FROM "upload"."file_collections" WHERE "collectionId" = c.id) AS "fileCollectionsCount",
                NULL::text AS "fcId",
                NULL::text AS "fileId",
                NULL::text AS "collectionId",
                NULL::timestamp AS "addedAt",
                NULL::text AS "file_id",
                NULL::text AS "file_userId",
                NULL::text AS "file_filename",
                NULL::text AS "file_originalFilename",
                NULL::int AS "file_fileSize",
                NULL::text AS "file_mimeType",
                NULL::"upload"."FileType" AS "file_fileType",
                NULL::text AS "file_s3Key",
                NULL::text AS "file_s3Bucket",
                NULL::text AS "file_s3Url",
                NULL::text AS "file_thumbnailPath",
                NULL::text AS "file_youtubeUrl",
                NULL::"upload"."UploadStatus" AS "file_uploadStatus",
                NULL::"upload"."ProcessingStatus" AS "file_processingStatus",
                NULL::"upload"."ProcessingStage" AS "file_processingStage",
                NULL::jsonb AS "file_metadata",
                NULL::text AS "file_errorMessage",
                NULL::timestamp AS "file_uploadedAt",
                NULL::timestamp AS "file_processingStartedAt",
                NULL::timestamp AS "file_processingCompletedAt",
                NULL::timestamp AS "file_createdAt",
                NULL::timestamp AS "file_updatedAt",
                c."createdAt" AS "sortDate"
            FROM "upload"."collections" c
            WHERE c."parentId" = ${collectionId}

            UNION ALL

            -- FILES
            SELECT
                'file' AS type,
                NULL::text AS id,
                NULL::text AS "userId",
                NULL::text AS name,
                NULL::text AS description,
                NULL::text AS color,
                NULL::text AS "parentId",
                NULL::timestamp AS "createdAt",
                NULL::timestamp AS "updatedAt",
                NULL::int AS "childrenCount",
                NULL::int AS "fileCollectionsCount",
                fc.id AS "fcId",
                fc."fileId",
                fc."collectionId",
                fc."addedAt",
                f.id AS "file_id",
                f."userId" AS "file_userId",
                f.filename AS "file_filename",
                f."originalFilename" AS "file_originalFilename",
                f."fileSize" AS "file_fileSize",
                f."mimeType" AS "file_mimeType",
                f."fileType" AS "file_fileType",
                f."s3Key" AS "file_s3Key",
                f."s3Bucket" AS "file_s3Bucket",
                f."s3Url" AS "file_s3Url",
                f."thumbnailPath" AS "file_thumbnailPath",
                f."youtubeUrl" AS "file_youtubeUrl",
                f."uploadStatus" AS "file_uploadStatus",
                f."processingStatus" AS "file_processingStatus",
                f."processingStage" AS "file_processingStage",
                f.metadata AS "file_metadata",
                f."errorMessage" AS "file_errorMessage",
                f."uploadedAt" AS "file_uploadedAt",
                f."processingStartedAt" AS "file_processingStartedAt",
                f."processingCompletedAt" AS "file_processingCompletedAt",
                f."createdAt" AS "file_createdAt",
                f."updatedAt" AS "file_updatedAt",
                fc."addedAt" AS "sortDate"
            FROM "upload"."file_collections" fc
            JOIN "upload"."files" f ON f.id = fc."fileId"
            WHERE fc."collectionId" = ${collectionId}
        ) items
        ORDER BY "sortDate" DESC
        OFFSET ${offset}
        LIMIT ${limit}
    `;
};

/**
 * Type definition for the raw query result
 */
export interface CollectionItemQueryResult {
    type: string;
    total: number;
    // Collection fields
    id: string | null;
    userId: string | null;
    name: string | null;
    description: string | null;
    color: string | null;
    parentId: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
    childrenCount: number | null;
    fileCollectionsCount: number | null;
    // FileCollection fields
    fcId: string | null;
    fileId: string | null;
    collectionId: string | null;
    addedAt: Date | null;
    // File fields (prefixed with file_)
    file_id: string | null;
    file_userId: string | null;
    file_filename: string | null;
    file_originalFilename: string | null;
    file_fileSize: number | null;
    file_mimeType: string | null;
    file_fileType: string | null;
    file_s3Key: string | null;
    file_s3Bucket: string | null;
    file_s3Url: string | null;
    file_thumbnailPath: string | null;
    file_youtubeUrl: string | null;
    file_uploadStatus: string | null;
    file_processingStatus: string | null;
    file_processingStage: string | null;
    file_metadata: any | null;
    file_errorMessage: string | null;
    file_uploadedAt: Date | null;
    file_processingStartedAt: Date | null;
    file_processingCompletedAt: Date | null;
    file_createdAt: Date | null;
    file_updatedAt: Date | null;
    sortDate: Date;
}
