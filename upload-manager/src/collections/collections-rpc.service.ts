import { Injectable } from '@nestjs/common';
import { collectionsV1 } from '@ragspace/shared-ts';
import { FilesService } from '../files/files.service';
import { toProtoCollection } from './collection.mapper';
import { CollectionsService, ParentFilter } from './collections.service';

@Injectable()
export class CollectionsRpcService implements collectionsV1.CollectionServiceImplementation {
    constructor(
        private readonly collections: CollectionsService,
        private readonly files: FilesService,
    ) { }

    async createCollection(request: collectionsV1.CreateCollectionRequest): Promise<collectionsV1.CreateCollectionResponse> {
        const collection = await this.collections.create(request.userId, {
            name: request.name,
            description: request.description,
            color: request.color,
            parentId: request.parentId,
        });
        return { collection: toProtoCollection(collection) };
    }

    async getCollection(request: collectionsV1.GetCollectionRequest): Promise<collectionsV1.GetCollectionResponse> {
        return { collection: toProtoCollection(await this.collections.get(request.userId, request.collectionId)) };
    }

    async listCollections(request: collectionsV1.ListCollectionsRequest): Promise<collectionsV1.ListCollectionsResponse> {
        const filter: ParentFilter =
            request.parentFilter?.$case === 'parentId'
                ? { kind: 'parent', parentId: request.parentFilter.parentId }
                : request.parentFilter?.$case === 'topLevelOnly' && request.parentFilter.topLevelOnly
                    ? { kind: 'topLevel' }
                    : { kind: 'all' };
        const { collections, nextPageToken } = await this.collections.list(
            request.userId,
            filter,
            request.pageSize,
            request.pageToken,
        );
        return { collections: collections.map(toProtoCollection), nextPageToken };
    }

    async listCollectionItems(
        request: collectionsV1.ListCollectionItemsRequest,
    ): Promise<collectionsV1.ListCollectionItemsResponse> {
        const { items, nextPageToken } = await this.collections.listItems(
            request.userId,
            request.collectionId,
            request.pageSize,
            request.pageToken,
        );
        return {
            items: await Promise.all(
                items.map(async (item): Promise<collectionsV1.CollectionItem> =>
                    item.kind === 'collection'
                        ? { item: { $case: 'collection', collection: toProtoCollection(item.collection) } }
                        : {
                            item: {
                                $case: 'file',
                                file: { file: await this.files.present(item.file, true), addTime: item.addedAt },
                            },
                        },
                ),
            ),
            nextPageToken,
        };
    }

    async updateCollection(request: collectionsV1.UpdateCollectionRequest): Promise<collectionsV1.UpdateCollectionResponse> {
        const collection = await this.collections.update(request.userId, request.collectionId, {
            name: request.name,
            description: request.description,
            color: request.color,
            parentId: request.parentId,
            moveToTopLevel: request.moveToTopLevel,
        });
        return { collection: toProtoCollection(collection) };
    }

    deleteCollection(request: collectionsV1.DeleteCollectionRequest): Promise<collectionsV1.DeleteCollectionResponse> {
        return this.collections.delete(request.userId, request.collectionId, request.deleteFiles);
    }

    async addCollectionFiles(request: collectionsV1.AddCollectionFilesRequest): Promise<collectionsV1.AddCollectionFilesResponse> {
        const collection = await this.collections.addFiles(request.userId, request.collectionId, request.fileIds);
        return { collection: toProtoCollection(collection) };
    }

    async removeCollectionFiles(
        request: collectionsV1.RemoveCollectionFilesRequest,
    ): Promise<collectionsV1.RemoveCollectionFilesResponse> {
        const collection = await this.collections.removeFiles(request.userId, request.collectionId, request.fileIds);
        return { collection: toProtoCollection(collection) };
    }

    async resolveCollectionFileIds(
        request: collectionsV1.ResolveCollectionFileIdsRequest,
    ): Promise<collectionsV1.ResolveCollectionFileIdsResponse> {
        return { fileIds: await this.collections.resolveFileIds(request.userId, request.collectionId, request.recursive) };
    }
}
