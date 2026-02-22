import type { FileResponseDto } from './upload.types';

export interface Collection {
    id: string;
    userId: string;
    name: string;
    description?: string;
    color?: string;
    parentId?: string;
    createdAt: string;
    updatedAt: string;
    children?: Collection[];
    fileCollections?: FileCollection[];
    _count?: {
        fileCollections: number;
        children: number;
    };
    pagination?: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}

// Union types for collection items
export type CollectionItem = Collection & {
    type: 'collection';
};

export type FileCollectionItem = {
    type: 'file';
    id: string;
    fileId: string;
    addedAt: string;
    file: FileResponseDto;
};

export type CollectionItemUnion = CollectionItem | FileCollectionItem;

// Response type for collection details with items
export interface CollectionWithItems extends Collection {
    items: CollectionItemUnion[];
}

export interface FileCollection {
    id: string;
    fileId: string;
    collectionId: string;
    addedAt: string;
    file?: FileResponseDto;
}

export interface CreateCollectionDto {
    name: string;
    description?: string;
    color?: string;
    parentId?: string;
}

export interface UpdateCollectionDto {
    name?: string;
    description?: string;
    color?: string;
    parentId?: string;
}

export interface AddFilesToCollectionDto {
    fileIds: string[];
}

export interface RemoveFilesFromCollectionDto {
    fileIds: string[];
}

export interface DeleteCollectionDto {
    deleteFiles?: boolean;
}

export interface DeleteCollectionResponse {
    deletedCollections: number;
    deletedFiles: number;
}

// For attachment display in search/chat
export interface CollectionAttachment {
    id: string;
    name: string;
    color?: string;
    fileCount: number;
}
