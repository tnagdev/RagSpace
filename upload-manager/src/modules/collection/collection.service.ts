import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ForbiddenException,
    Inject,
    forwardRef,
    Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from './../s3/s3.service';
import { UploadService } from '../upload/upload.service';
import {
    CreateCollectionDto,
    UpdateCollectionDto,
    AddFilesToCollectionDto,
    RemoveFilesFromCollectionDto,
} from './dto/collection.dto';
import { Collection } from '@prisma/client';
import { AuthUser } from 'src/common/decorators/current-user.decorator';
import { CollectionItemUnion, CollectionWithRelations } from 'src/types/collection';
import { getCollectionItemsQuery, CollectionItemQueryResult } from './collection.queries';


@Injectable()
export class CollectionService {
    private readonly logger = new Logger(CollectionService.name);

    constructor(
        private prisma: PrismaService,
        private s3Service: S3Service,
        @Inject(forwardRef(() => UploadService))
        private uploadService: UploadService,
    ) { }

    async create(
        userId: string,
        createCollectionDto: CreateCollectionDto,
    ): Promise<CollectionWithRelations> {
        const { parentId, ...data } = createCollectionDto;

        if (parentId) {
            const parentCollection = await this.prisma.collection.findUnique({
                where: { id: parentId },
            });

            if (!parentCollection) {
                throw new NotFoundException('Parent collection not found');
            }

            if (parentCollection.userId !== userId) {
                throw new ForbiddenException('Parent collection does not belong to you');
            }
        }

        return this.prisma.collection.create({
            data: {
                ...data,
                userId,
                parentId,
            },
            include: {
                _count: {
                    select: {
                        fileCollections: true,
                        children: true,
                    },
                },
            },
        });
    }

    async findAll(userId: string, parentId?: string): Promise<CollectionWithRelations[]> {
        const whereClause: any = { userId };

        if (parentId === 'root' || !parentId) {
            whereClause.parentId = null;
        } else {
            const parentCollection = await this.prisma.collection.findUnique({
                where: { id: parentId },
            });

            if (!parentCollection) {
                throw new NotFoundException('Parent collection not found');
            }

            if (parentCollection.userId !== userId) {
                throw new ForbiddenException('Parent collection does not belong to you');
            }

            whereClause.parentId = parentId;
        }

        const collections = await this.prisma.collection.findMany({
            where: whereClause,
            include: {
                _count: {
                    select: {
                        fileCollections: true,
                        children: true,
                    },
                },
            },
            orderBy: [{ createdAt: 'desc' }],
        });

        return collections;
    }

    async findAllFlat(
        userId: string,
        page: number = 1,
        limit: number = 100,
    ): Promise<{
        collections: CollectionWithRelations[];
        pagination: { total: number; page: number; limit: number; totalPages: number };
    }> {
        const skip = (page - 1) * limit;

        const total = await this.prisma.collection.count({
            where: { userId },
        });

        const collections = await this.prisma.collection.findMany({
            where: { userId },
            include: {
                _count: {
                    select: {
                        fileCollections: true,
                        children: true,
                    },
                },
            },
            orderBy: [{ createdAt: 'desc' }],
            skip,
            take: limit,
        });

        return {
            collections,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async findOne(
        userId: string,
        collectionId: string,
        page: number = 1,
        limit: number = 12,
    ): Promise<Collection & {
        _count: { fileCollections: number; children: number };
        items: CollectionItemUnion[];
        pagination: { total: number; page: number; limit: number; totalPages: number };
    }> {
        const collection = await this.prisma.collection.findUnique({
            where: { id: collectionId },
            include: {
                _count: {
                    select: {
                        children: true,
                        fileCollections: true,
                    },
                },
            },
        });

        if (!collection) {
            throw new NotFoundException('Collection not found');
        }

        if (collection.userId !== userId) {
            throw new ForbiddenException('Collection does not belong to you');
        }

        const totalChildren = collection._count.children;
        const totalFiles = collection._count.fileCollections;
        const totalItems = totalChildren + totalFiles;
        const totalPages = Math.ceil(totalItems / limit);
        const skip = (page - 1) * limit;

        const rawResults = await this.prisma.$queryRaw<CollectionItemQueryResult[]>(
            getCollectionItemsQuery(collectionId, limit, skip)
        );

        const items: CollectionItemUnion[] = await Promise.all(
            rawResults.map(async (row) => {
                if (row.type === 'collection') {
                    return {
                        id: row.id!,
                        userId: row.userId!,
                        name: row.name!,
                        description: row.description,
                        color: row.color,
                        parentId: row.parentId,
                        createdAt: row.createdAt!,
                        updatedAt: row.updatedAt!,
                        type: 'collection' as const,
                        _count: {
                            children: row.childrenCount!,
                            fileCollections: row.fileCollectionsCount!,
                        },
                    };
                } else {
                    const file: any = {
                        id: row.file_id!,
                        userId: row.file_userId!,
                        filename: row.file_filename!,
                        originalFilename: row.file_originalFilename!,
                        fileSize: row.file_fileSize!,
                        mimeType: row.file_mimeType!,
                        fileType: row.file_fileType!,
                        s3Key: row.file_s3Key!,
                        s3Bucket: row.file_s3Bucket!,
                        s3Url: row.file_s3Url,
                        thumbnailPath: row.file_thumbnailPath,
                        youtubeUrl: row.file_youtubeUrl,
                        uploadStatus: row.file_uploadStatus!,
                        processingStatus: row.file_processingStatus!,
                        processingStage: row.file_processingStage!,
                        metadata: row.file_metadata,
                        errorMessage: row.file_errorMessage,
                        uploadedAt: row.file_uploadedAt,
                        processingStartedAt: row.file_processingStartedAt,
                        processingCompletedAt: row.file_processingCompletedAt,
                        createdAt: row.file_createdAt!,
                        updatedAt: row.file_updatedAt!,
                    };

                    if (file.thumbnailPath) {
                        file.thumbnailUrl = await this.s3Service.getSignedUrl(file.thumbnailPath);
                    }

                    return {
                        id: row.fcId!,
                        fileId: row.fileId!,
                        collectionId: row.collectionId!,
                        addedAt: row.addedAt!,
                        type: 'file' as const,
                        file,
                    };
                }
            })
        );

        return {
            ...collection,
            items,
            pagination: {
                total: totalItems,
                page,
                limit,
                totalPages,
            },
        };
    }

    async update(
        userId: string,
        collectionId: string,
        updateCollectionDto: UpdateCollectionDto,
    ): Promise<CollectionWithRelations> {
        const collection = await this.prisma.collection.findUnique({
            where: { id: collectionId },
        });

        if (!collection) {
            throw new NotFoundException('Collection not found');
        }

        if (collection.userId !== userId) {
            throw new ForbiddenException('Collection does not belong to you');
        }

        const { parentId, ...data } = updateCollectionDto;

        if (parentId !== undefined) {
            if (parentId === collectionId) {
                throw new BadRequestException('Collection cannot be its own parent');
            }

            if (parentId) {
                const parentCollection = await this.prisma.collection.findUnique({
                    where: { id: parentId },
                });

                if (!parentCollection) {
                    throw new NotFoundException('Parent collection not found');
                }

                if (parentCollection.userId !== userId) {
                    throw new ForbiddenException(
                        'Parent collection does not belong to you',
                    );
                }

                const wouldCreateCircle = await this.checkCircularReference(
                    collectionId,
                    parentId,
                );

                if (wouldCreateCircle) {
                    throw new BadRequestException(
                        'Cannot move collection: would create circular reference',
                    );
                }
            }
        }

        return this.prisma.collection.update({
            where: { id: collectionId },
            data: {
                ...data,
                ...(parentId !== undefined ? { parentId } : {}),
            },
            include: {
                _count: {
                    select: {
                        fileCollections: true,
                        children: true,
                    },
                },
            },
        });
    }

    async delete(
        user: AuthUser,
        collectionId: string,
        deleteFiles: boolean = false,
    ): Promise<{ deletedCollections: number; deletedFiles: number }> {
        const collection = await this.prisma.collection.findUnique({
            where: { id: collectionId },
        });

        if (!collection) {
            throw new NotFoundException('Collection not found');
        }

        if (collection.userId !== user.id) {
            throw new ForbiddenException('Collection does not belong to you');
        }

        const descendantIds = await this.getAllDescendantIds(collectionId);
        const allCollectionIds = [collectionId, ...descendantIds];

        let deletedFilesCount = 0;

        if (deleteFiles) {
            const filesToDelete = await this.prisma.file.findMany({
                where: {
                    userId: user.id,
                    fileCollections: {
                        some: {
                            collectionId: { in: allCollectionIds },
                        },
                    },
                },
                include: {
                    fileCollections: {
                        select: {
                            collectionId: true,
                        },
                    },
                },
            });

            const exclusiveFiles = filesToDelete.filter((file) => {
                const collectionIds = file.fileCollections.map(
                    (fc) => fc.collectionId,
                );
                return collectionIds.every((id) => allCollectionIds.includes(id));
            });

            if (exclusiveFiles.length > 0) {
                const exclusiveFileIds = exclusiveFiles.map(f => f.id);
                try {
                    const result = await this.uploadService.deleteFiles(exclusiveFileIds, user);
                    deletedFilesCount = result.deletedCount;
                    this.logger.log(`Batch deleted ${deletedFilesCount} files as part of collection deletion`);
                } catch (error) {
                    this.logger.error(`Error batch deleting files: ${error.message}`);
                }
            }
        }

        const deleteResult = await this.prisma.collection.deleteMany({
            where: {
                id: { in: allCollectionIds },
                userId: user.id,
            },
        });

        return {
            deletedCollections: deleteResult.count,
            deletedFiles: deletedFilesCount,
        };
    }

    async addFiles(
        userId: string,
        collectionId: string,
        addFilesDto: AddFilesToCollectionDto,
    ): Promise<CollectionWithRelations> {
        const collection = await this.prisma.collection.findUnique({
            where: { id: collectionId },
        });

        if (!collection) {
            throw new NotFoundException('Collection not found');
        }

        if (collection.userId !== userId) {
            throw new ForbiddenException('Collection does not belong to you');
        }

        const files = await this.prisma.file.findMany({
            where: {
                id: { in: addFilesDto.fileIds },
                userId,
            },
        });

        if (files.length !== addFilesDto.fileIds.length) {
            throw new BadRequestException('Some files not found or do not belong to you');
        }

        await this.prisma.$transaction(
            addFilesDto.fileIds.map((fileId) =>
                this.prisma.fileCollection.upsert({
                    where: {
                        fileId_collectionId: {
                            fileId,
                            collectionId,
                        },
                    },
                    create: {
                        fileId,
                        collectionId,
                    },
                    update: {},
                }),
            ),
        );

        return this.findOne(userId, collectionId);
    }

    async removeFiles(
        userId: string,
        collectionId: string,
        removeFilesDto: RemoveFilesFromCollectionDto,
    ): Promise<CollectionWithRelations> {
        const collection = await this.prisma.collection.findUnique({
            where: { id: collectionId },
        });

        if (!collection) {
            throw new NotFoundException('Collection not found');
        }

        if (collection.userId !== userId) {
            throw new ForbiddenException('Collection does not belong to you');
        }

        await this.prisma.fileCollection.deleteMany({
            where: {
                collectionId,
                fileId: { in: removeFilesDto.fileIds },
            },
        });

        return this.findOne(userId, collectionId);
    }

    async getCollectionFiles(userId: string, collectionId: string): Promise<string[]> {
        const collection = await this.prisma.collection.findUnique({
            where: { id: collectionId },
        });

        if (!collection) {
            throw new NotFoundException('Collection not found');
        }

        if (collection.userId !== userId) {
            throw new ForbiddenException('Collection does not belong to you');
        }

        const allCollectionIds = [collectionId, ...(await this.getAllDescendantIds(collectionId))];

        const fileCollections = await this.prisma.fileCollection.findMany({
            where: {
                collectionId: { in: allCollectionIds },
            },
            select: {
                fileId: true,
            },
            distinct: ['fileId'],
        });

        return fileCollections.map(fc => fc.fileId);
    }

    private async getAllDescendantIds(collectionId: string): Promise<string[]> {
        const rows = await this.prisma.$queryRaw<{ id: string }[]>`
            WITH RECURSIVE tree AS (
                SELECT id FROM upload."Collection" WHERE "parentId" = ${collectionId}
                UNION ALL
                SELECT c.id FROM upload."Collection" c JOIN tree ON c."parentId" = tree.id
            )
            SELECT id FROM tree
        `;
        return rows.map(r => r.id);
    }

    private async checkCircularReference(
        collectionId: string,
        newParentId: string,
    ): Promise<boolean> {
        const ancestors = await this.prisma.$queryRaw<{ id: string }[]>`
            WITH RECURSIVE ancestors AS (
                SELECT "parentId" AS id FROM upload."Collection" WHERE id = ${newParentId}
                UNION ALL
                SELECT c."parentId" FROM upload."Collection" c JOIN ancestors a ON c.id = a.id
                WHERE c."parentId" IS NOT NULL
            )
            SELECT id FROM ancestors WHERE id IS NOT NULL
        `;
        return ancestors.some(a => a.id === collectionId);
    }
}
