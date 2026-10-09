import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
    assertBatchSize,
    clampPageSize,
    decodePageToken,
    encodePageToken,
    failedPrecondition,
    invalidArgument,
    notFound,
} from '@ragspace/shared-ts';
import { eventBus } from '../events/event-bus';
import { FILE_SELECT, FileRecord } from '../files/file.mapper';
import { FilesService } from '../files/files.service';
import { PrismaService } from '../modules/prisma/prisma.service';
import { COLLECTION_SELECT, CollectionRecord } from './collection.mapper';

const MAX_RESOLVED_FILES = 10_000;
const DELETE_BATCH = 100;

export type ParentFilter = { kind: 'all' } | { kind: 'topLevel' } | { kind: 'parent'; parentId: string };

export interface CollectionChanges {
    name?: string;
    description?: string;
    color?: string;
    parentId?: string;
    moveToTopLevel: boolean;
}

export type CollectionItem =
    | { kind: 'collection'; collection: CollectionRecord }
    | { kind: 'file'; file: FileRecord; addedAt: Date };

type ItemsCursor = { p: 'c'; n: string; id: string } | { p: 'f'; t?: string; id?: string };

@Injectable()
export class CollectionsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly files: FilesService,
    ) { }

    async get(userId: string, collectionId: string): Promise<CollectionRecord> {
        const collection = await this.prisma.collection.findFirst({
            where: { id: collectionId, userId },
            select: COLLECTION_SELECT,
        });
        if (!collection) throw notFound('Collection');
        return collection;
    }

    async create(
        userId: string,
        input: { name: string; description?: string; color?: string; parentId?: string },
    ): Promise<CollectionRecord> {
        const name = input.name.trim();
        if (!name) throw invalidArgument('name must not be empty');
        if (input.parentId) await this.get(userId, input.parentId);
        return this.prisma.collection.create({
            data: {
                userId,
                name,
                description: input.description || null,
                color: input.color || null,
                parentId: input.parentId || null,
            },
            select: COLLECTION_SELECT,
        });
    }

    async list(
        userId: string,
        filter: ParentFilter,
        pageSize: number,
        pageToken: string,
    ): Promise<{ collections: CollectionRecord[]; nextPageToken: string }> {
        const size = clampPageSize(pageSize);
        const cursor = decodePageToken<{ n: string; id: string }>(pageToken);
        if (filter.kind === 'parent') await this.get(userId, filter.parentId);
        const rows = await this.prisma.collection.findMany({
            where: {
                userId,
                ...(filter.kind === 'topLevel' ? { parentId: null } : {}),
                ...(filter.kind === 'parent' ? { parentId: filter.parentId } : {}),
                ...(cursor ? afterName(cursor) : {}),
            },
            select: COLLECTION_SELECT,
            orderBy: [{ name: 'asc' }, { id: 'asc' }],
            take: size + 1,
        });
        const collections = rows.slice(0, size);
        const last = collections[collections.length - 1];
        return {
            collections,
            nextPageToken: rows.length > size && last ? encodePageToken({ n: last.name, id: last.id }) : '',
        };
    }

    async listItems(
        userId: string,
        collectionId: string,
        pageSize: number,
        pageToken: string,
    ): Promise<{ items: CollectionItem[]; nextPageToken: string }> {
        await this.get(userId, collectionId);
        const size = clampPageSize(pageSize);
        const cursor = decodePageToken<ItemsCursor>(pageToken);
        const items: CollectionItem[] = [];

        let remaining = size;
        let fileCursor: { t?: string; id?: string } | undefined;
        if (!cursor || cursor.p === 'c') {
            const children = await this.prisma.collection.findMany({
                where: { userId, parentId: collectionId, ...(cursor ? afterName(cursor) : {}) },
                select: COLLECTION_SELECT,
                orderBy: [{ name: 'asc' }, { id: 'asc' }],
                take: size + 1,
            });
            if (children.length > size) {
                const page = children.slice(0, size);
                const last = page[page.length - 1];
                return {
                    items: page.map((collection) => ({ kind: 'collection', collection })),
                    nextPageToken: encodePageToken({ p: 'c', n: last.name, id: last.id }),
                };
            }
            items.push(...children.map((collection) => ({ kind: 'collection' as const, collection })));
            remaining = size - children.length;
        } else {
            fileCursor = cursor;
        }

        const entries = await this.prisma.fileCollection.findMany({
            where: {
                collectionId,
                file: { userId },
                ...(fileCursor?.t && fileCursor.id
                    ? {
                        OR: [
                            { addedAt: { lt: new Date(fileCursor.t) } },
                            { addedAt: new Date(fileCursor.t), id: { lt: fileCursor.id } },
                        ],
                    }
                    : {}),
            },
            select: { id: true, addedAt: true, file: { select: FILE_SELECT } },
            orderBy: [{ addedAt: 'desc' }, { id: 'desc' }],
            take: remaining + 1,
        });
        const page = entries.slice(0, remaining);
        items.push(...page.map((entry) => ({ kind: 'file' as const, file: entry.file, addedAt: entry.addedAt })));

        if (entries.length <= remaining) return { items, nextPageToken: '' };
        const last = page[page.length - 1];
        return {
            items,
            nextPageToken: encodePageToken(last ? { p: 'f', t: last.addedAt.toISOString(), id: last.id } : { p: 'f' }),
        };
    }

    async update(userId: string, collectionId: string, changes: CollectionChanges): Promise<CollectionRecord> {
        await this.get(userId, collectionId);
        const data: Prisma.CollectionUncheckedUpdateInput = {};
        if (changes.name !== undefined) {
            const name = changes.name.trim();
            if (!name) throw invalidArgument('name must not be empty');
            data.name = name;
        }
        if (changes.description !== undefined) data.description = changes.description || null;
        if (changes.color !== undefined) data.color = changes.color || null;
        if (changes.moveToTopLevel) {
            data.parentId = null;
        } else if (changes.parentId) {
            if (changes.parentId === collectionId) throw invalidArgument('A collection cannot contain itself');
            await this.get(userId, changes.parentId);
            if ((await this.descendantIds(collectionId)).includes(changes.parentId)) {
                throw failedPrecondition('A collection cannot be moved inside its own sub-collection');
            }
            data.parentId = changes.parentId;
        }
        return this.prisma.collection.update({ where: { id: collectionId }, data, select: COLLECTION_SELECT });
    }

    async delete(
        userId: string,
        collectionId: string,
        deleteFiles: boolean,
    ): Promise<{ deletedCollectionCount: number; deletedFileCount: number }> {
        await this.get(userId, collectionId);
        const collectionIds = [collectionId, ...(await this.descendantIds(collectionId))];

        let deletedFileCount = 0;
        if (deleteFiles) {
            for (; ;) {
                const exclusive = await this.prisma.file.findMany({
                    where: {
                        userId,
                        fileCollections: { some: { collectionId: { in: collectionIds } } },
                        NOT: { fileCollections: { some: { collectionId: { notIn: collectionIds } } } },
                    },
                    select: { id: true },
                    take: DELETE_BATCH,
                });
                if (exclusive.length === 0) break;
                for (const { id } of exclusive) await this.files.delete(userId, id);
                deletedFileCount += exclusive.length;
            }
        }

        const { count } = await this.prisma.collection.deleteMany({ where: { id: { in: collectionIds }, userId } });
        await eventBus.publish({ $case: 'collectionDeleted', collectionDeleted: { userId, collectionIds } });
        return { deletedCollectionCount: count, deletedFileCount };
    }

    async addFiles(userId: string, collectionId: string, fileIds: string[]): Promise<CollectionRecord> {
        assertBatchSize(fileIds, 'file_ids');
        await this.get(userId, collectionId);
        const unique = [...new Set(fileIds)];
        const owned = await this.prisma.file.count({ where: { userId, id: { in: unique } } });
        if (owned !== unique.length) throw notFound('File');
        await this.prisma.fileCollection.createMany({
            data: unique.map((fileId) => ({ fileId, collectionId })),
            skipDuplicates: true,
        });
        return this.get(userId, collectionId);
    }

    async removeFiles(userId: string, collectionId: string, fileIds: string[]): Promise<CollectionRecord> {
        assertBatchSize(fileIds, 'file_ids');
        await this.get(userId, collectionId);
        await this.prisma.fileCollection.deleteMany({ where: { collectionId, fileId: { in: fileIds } } });
        return this.get(userId, collectionId);
    }

    async resolveFileIds(userId: string, collectionId: string, recursive: boolean): Promise<string[]> {
        await this.get(userId, collectionId);
        const collectionIds = recursive ? [collectionId, ...(await this.descendantIds(collectionId))] : [collectionId];
        const rows = await this.prisma.fileCollection.findMany({
            where: { collectionId: { in: collectionIds }, file: { userId } },
            select: { fileId: true },
            distinct: ['fileId'],
            take: MAX_RESOLVED_FILES,
        });
        return rows.map((row) => row.fileId);
    }

    private async descendantIds(collectionId: string): Promise<string[]> {
        const rows = await this.prisma.$queryRaw<{ id: string }[]>`
            WITH RECURSIVE tree AS (
                SELECT id FROM "upload"."collections" WHERE "parentId" = ${collectionId}
                UNION ALL
                SELECT c.id FROM "upload"."collections" c JOIN tree ON c."parentId" = tree.id
            )
            SELECT id FROM tree`;
        return rows.map((row) => row.id);
    }
}

function afterName(cursor: { n: string; id: string }): Prisma.CollectionWhereInput {
    return { OR: [{ name: { gt: cursor.n } }, { name: cursor.n, id: { gt: cursor.id } }] };
}
