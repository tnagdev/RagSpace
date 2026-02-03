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
import { S3Service } from '../s3/s3.service';
import { UploadService } from '../upload/upload.service';
import {
    CreateCollectionDto,
    UpdateCollectionDto,
    AddFilesToCollectionDto,
    RemoveFilesFromCollectionDto,
} from '../dto/collection.dto';
import { Collection, File } from '@prisma/client';
import { AuthUser } from 'src/common/types/auth-user.type';

export interface CollectionWithRelations extends Collection {
    children?: CollectionWithRelations[];
    fileCollections?: Array<{
        id: string;
        fileId: string;
        addedAt: Date;
        file: File;
    }>;
    _count?: {
        fileCollections: number;
        children: number;
    };
}

// Union types for collection items
type CollectionItem = Collection & {
    type: 'collection';
    _count?: { fileCollections: number; children: number };
};

type FileCollectionItem = {
    type: 'file';
    id: string;
    fileId: string;
    addedAt: Date;
    file: File;
};

type CollectionItemUnion = CollectionItem | FileCollectionItem;

// Type for raw Prisma query result
type RawCollectionItem =
    | { type: 'collection'; data: Collection & { _count?: { fileCollections: number; children: number } } }
    | { type: 'file'; data: { id: string; fileId: string; addedAt: Date; file: File } };

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

        // Verify parent collection exists and belongs to user
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

        // Set parentId filter: null for root, or specific parent for children
        if (parentId === 'root' || parentId === undefined || parentId === null) {
            whereClause.parentId = null;
        } else {
            // Verify parent collection exists and belongs to user
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

        // Fetch collections with counts only (no nested children)
        // Frontend will lazy-load children as nodes are expanded
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

        // Get total count
        const total = await this.prisma.collection.count({
            where: { userId },
        });

        // Fetch collections with pagination
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
        // Get total counts first
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

        // Fetch ALL children and files (no limit) - we'll paginate after sorting
        const [children, fileCollections] = await Promise.all([
            this.prisma.collection.findMany({
                where: { parentId: collectionId },
                include: {
                    _count: {
                        select: {
                            fileCollections: true,
                            children: true,
                        },
                    },
                },
            }),
            this.prisma.fileCollection.findMany({
                where: { collectionId },
                include: {
                    file: true,
                },
            }),
        ]);

        // Transform thumbnailPath to thumbnailUrl for files
        await Promise.all(
            fileCollections.map(async (fc) => {
                if (fc.file?.thumbnailPath) {
                    const thumbnailUrl = await this.s3Service.getSignedUrl(fc.file.thumbnailPath);
                    (fc.file as any).thumbnailUrl = thumbnailUrl;
                }
            })
        );

        const rawItems: RawCollectionItem[] = [
            ...children.map(c => ({ type: 'collection' as const, data: c })),
            ...fileCollections.map(fc => ({ type: 'file' as const, data: fc }))
        ];

        const unionItems = this.transformToUnionItems(rawItems);

        const sortedItems = this.sortItemsByDate(unionItems);

        const paginatedItems = sortedItems.slice(skip, skip + limit);

        return {
            ...collection,
            items: paginatedItems,
            pagination: {
                total: totalItems,
                page,
                limit,
                totalPages,
            },
        };
    }

    private transformToUnionItems(rawItems: RawCollectionItem[]): CollectionItemUnion[] {
        return rawItems.map(item => {
            if (item.type === 'collection') {
                return {
                    ...item.data,
                    type: 'collection' as const,
                };
            }
            return {
                ...item.data,
                type: 'file' as const,
            };
        });
    }

    private sortItemsByDate(items: CollectionItemUnion[]): CollectionItemUnion[] {
        return items.sort((a, b) => {
            const dateA = a.type === 'collection' ? new Date(a.createdAt) : new Date(a.addedAt);
            const dateB = b.type === 'collection' ? new Date(b.createdAt) : new Date(b.addedAt);
            return dateB.getTime() - dateA.getTime();
        });
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

        // Verify new parent collection if provided
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

                // Check for circular reference
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

        // Get all descendant collection IDs
        const descendantIds = await this.getAllDescendantIds(collectionId);
        const allCollectionIds = [collectionId, ...descendantIds];

        let deletedFilesCount = 0;

        if (deleteFiles) {
            // Find files that belong ONLY to collections being deleted
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

            // Filter files that belong exclusively to these collections
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

        // Delete collections (cascade will delete FileCollection entries)
        const deleteResult = await this.prisma.collection.deleteMany({
            where: {
                id: { in: allCollectionIds },
                userId,
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

        // Verify all files exist and belong to user
        const files = await this.prisma.file.findMany({
            where: {
                id: { in: addFilesDto.fileIds },
                userId,
            },
        });

        if (files.length !== addFilesDto.fileIds.length) {
            throw new BadRequestException('Some files not found or do not belong to you');
        }

        // Create file-collection associations (ignore duplicates)
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
        // Verify collection exists and belongs to user
        const collection = await this.prisma.collection.findUnique({
            where: { id: collectionId },
        });

        if (!collection) {
            throw new NotFoundException('Collection not found');
        }

        if (collection.userId !== userId) {
            throw new ForbiddenException('Collection does not belong to you');
        }

        // Get all descendant collection IDs (including the collection itself)
        const allCollectionIds = [collectionId, ...(await this.getAllDescendantIds(collectionId))];

        // Get all unique file IDs from all these collections
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
        const descendants: string[] = [];
        const queue = [collectionId];

        while (queue.length > 0) {
            const currentId = queue.shift();
            const children = await this.prisma.collection.findMany({
                where: { parentId: currentId },
                select: { id: true },
            });

            for (const child of children) {
                descendants.push(child.id);
                queue.push(child.id);
            }
        }

        return descendants;
    }

    private async checkCircularReference(
        collectionId: string,
        newParentId: string,
    ): Promise<boolean> {
        let currentId: string | null = newParentId;

        while (currentId) {
            if (currentId === collectionId) {
                return true;
            }

            const parent = await this.prisma.collection.findUnique({
                where: { id: currentId },
                select: { parentId: true },
            });

            currentId = parent?.parentId || null;
        }

        return false;
    }
}
