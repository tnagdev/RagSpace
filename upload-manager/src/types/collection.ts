
import { Collection, File } from '@prisma/client';

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


export type CollectionItem = Collection & {
    type: 'collection';
    _count?: { fileCollections: number; children: number };
};

export type FileCollectionItem = {
    type: 'file';
    id: string;
    fileId: string;
    addedAt: Date;
    file: File;
};

export type CollectionItemUnion = CollectionItem | FileCollectionItem;


export type RawCollectionItem =
    | { type: 'collection'; data: Collection & { _count?: { fileCollections: number; children: number } } }
    | { type: 'file'; data: { id: string; fileId: string; addedAt: Date; file: File } };
