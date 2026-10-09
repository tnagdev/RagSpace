import { Prisma } from '@prisma/client';
import { collectionsV1 } from '@ragspace/shared-ts';

export const COLLECTION_SELECT = {
    id: true,
    userId: true,
    name: true,
    description: true,
    color: true,
    parentId: true,
    createdAt: true,
    updatedAt: true,
    _count: { select: { fileCollections: true, children: true } },
} satisfies Prisma.CollectionSelect;

export type CollectionRecord = Prisma.CollectionGetPayload<{ select: typeof COLLECTION_SELECT }>;

export function toProtoCollection(collection: CollectionRecord): collectionsV1.Collection {
    return {
        id: collection.id,
        userId: collection.userId,
        name: collection.name,
        description: collection.description ?? undefined,
        color: collection.color ?? undefined,
        parentId: collection.parentId ?? undefined,
        fileCount: collection._count.fileCollections,
        childCount: collection._count.children,
        createTime: collection.createdAt,
        updateTime: collection.updatedAt,
    };
}
