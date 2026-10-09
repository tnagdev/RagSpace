import { useState, useCallback, useMemo, useEffect } from 'react';
import { Plus, FolderPlus, RefreshCw, Pencil, Trash2, Folder, Grid3x3, List, FilePlus } from 'lucide-react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { TreeView, type TreeNode, type TreeAction } from '@/components/TreeView';
import { CreateCollectionDialog } from '../files/components/CreateCollectionDialog';
import { DeleteCollectionDialog } from '../files/components/DeleteCollectionDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FileCard } from '../files/components/FileCard';
import { FileTableRow } from '../files/components/FileTableRow';
import { CollectionCard } from './components/CollectionCard';
import FilePickerModal from '../search/components/FilePickerModal';
import Button from '@/components/Button';
import Loader from '@/components/Loader';
import {
    type CollectionNode,
    buildTree,
    useAddFilesToCollection,
    useCollection,
    useCollectionItems,
    useCollections,
    useRemoveFilesFromCollection,
} from '@/hooks/useCollection';
import { useDeleteFile } from '@/hooks/useUpload';
import type { ApiFile, Collection } from '@/api/types';
import { collectionColor } from '@/lib/collectionColors';

type ViewItem = (Collection & { type: 'collection' }) | { type: 'file'; fileId: string; file: ApiFile };

const CollectionsPage = () => {
    const params = useParams({ strict: false });
    const navigate = useNavigate();
    const collectionIdFromRoute = params?.id as string | undefined;

    const [selectedCollectionId, setSelectedCollectionId] = useState<string | undefined>(collectionIdFromRoute);
    const [isCreateCollectionOpen, setIsCreateCollectionOpen] = useState(false);
    const [isDeleteCollectionOpen, setIsDeleteCollectionOpen] = useState(false);
    const [collectionToDelete, setCollectionToDelete] = useState<Collection | null>(null);
    const [collectionToEdit, setCollectionToEdit] = useState<Collection | null>(null);
    const [parentIdForNewCollection, setParentIdForNewCollection] = useState<string | undefined>();
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
    const [fileToDelete, setFileToDelete] = useState<string | null>(null);
    const [fileToRemove, setFileToRemove] = useState<string | null>(null);

    const { data: allCollections, isLoading, refetch } = useCollections();
    const rootCollections = useMemo(() => buildTree(allCollections ?? []), [allCollections]);

    const { data: selectedCollection, isLoading: isLoadingCollection } = useCollection(selectedCollectionId ?? '');
    const {
        data: itemPages,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = useCollectionItems(selectedCollectionId ?? '');

    const removeFilesFromCollection = useRemoveFilesFromCollection();
    const deleteFile = useDeleteFile();
    const addFilesToCollection = useAddFilesToCollection();

    // Sync route params with selected collection
    useEffect(() => {
        if (collectionIdFromRoute !== selectedCollectionId) {
            setSelectedCollectionId(collectionIdFromRoute);
        }
    }, [collectionIdFromRoute]);

    const handleCollectionSelect = useCallback((node: TreeNode) => {
        setSelectedCollectionId(node.id);
        navigate({ to: `/collections/${node.id}` });
    }, [navigate]);

    const handleCreateCollection = useCallback(() => {
        setParentIdForNewCollection(undefined);
        setCollectionToEdit(null);
        setIsCreateCollectionOpen(true);
    }, []);

    const handleEditCollection = useCallback((collection: Collection) => {
        setCollectionToEdit(collection);
        setParentIdForNewCollection(undefined);
        setIsCreateCollectionOpen(true);
    }, []);

    const handleDeleteCollection = useCallback((node: TreeNode) => {
        setCollectionToDelete(node.data as Collection);
        setIsDeleteCollectionOpen(true);
    }, []);

    const handleDeleteSuccess = useCallback(() => {
        if (collectionToDelete?.id === selectedCollectionId) {
            setSelectedCollectionId(undefined);
            navigate({ to: '/collections' });
        }
    }, [collectionToDelete, selectedCollectionId, navigate]);

    const handleAddFilesToCollection = useCallback(
        (files: ApiFile[]) => {
            if (!selectedCollectionId) return;
            addFilesToCollection.mutate({ collectionId: selectedCollectionId, fileIds: files.map((f) => f.id) });
        },
        [selectedCollectionId, addFilesToCollection]
    );

    const handleRemoveFromCollection = useCallback(
        (fileId: string) => {
            setFileToRemove(fileId);
        },
        []
    );

    const confirmRemoveFromCollection = useCallback(
        () => {
            if (!fileToRemove || !selectedCollectionId) return;
            removeFilesFromCollection.mutate(
                { collectionId: selectedCollectionId, fileIds: [fileToRemove] },
                { onSuccess: () => setFileToRemove(null) }
            );
        },
        [fileToRemove, selectedCollectionId, removeFilesFromCollection]
    );

    const handleDeleteFile = useCallback(
        (fileId: string) => {
            setFileToDelete(fileId);
        },
        []
    );

    const confirmDeleteFile = useCallback(
        () => {
            if (!fileToDelete) return;
            deleteFile.mutate(fileToDelete, { onSuccess: () => setFileToDelete(null) });
        },
        [fileToDelete, deleteFile]
    );

    const allItems: ViewItem[] = useMemo(
        () =>
            (itemPages?.pages ?? [])
                .flatMap((page) => page.items)
                .map((item) =>
                    item.kind === 'collection'
                        ? { ...item.collection, type: 'collection' as const }
                        : { type: 'file' as const, fileId: item.file.id, file: item.file }
                ),
        [itemPages]
    );
    const totalItems = allItems.length;

    const treeNodes: TreeNode[] = useMemo(() => {
        const convertToNode = (collection: CollectionNode): TreeNode => ({
            id: collection.id,
            label: collection.name,
            color: collectionColor(collection.color),
            badge: collection.fileCount,
            children: collection.children.map(convertToNode),
            data: collection,
        });

        return rootCollections.map(convertToNode);
    }, [rootCollections]);

    // Find path to selected node for auto-expansion
    const expandedNodeIds = useMemo(() => {
        if (!selectedCollectionId) return new Set<string>();

        const findPathToNode = (collections: CollectionNode[], targetId: string, path: string[] = []): string[] | null => {
            for (const collection of collections) {
                const currentPath = [...path, collection.id];

                if (collection.id === targetId) {
                    return currentPath.slice(0, -1);
                }

                if (collection.children.length > 0) {
                    const result = findPathToNode(collection.children, targetId, currentPath);
                    if (result) return result;
                }
            }
            return null;
        };

        const path = findPathToNode(rootCollections, selectedCollectionId);
        return new Set(path || []);
    }, [rootCollections, selectedCollectionId]);

    // Tree actions
    const treeActions: TreeAction[] = useMemo(
        () => [
            {
                label: 'Add Subcollection',
                icon: <FolderPlus className="w-3.5 h-3.5" />,
                onClick: (node: TreeNode) => {
                    setParentIdForNewCollection(node.id);
                    setIsCreateCollectionOpen(true);
                },
            },
            {
                label: 'Edit',
                icon: <Pencil className="w-3.5 h-3.5" />,
                onClick: (node: TreeNode) => handleEditCollection(node.data as Collection),
            },
            {
                label: 'Delete',
                icon: <Trash2 className="w-3.5 h-3.5" />,
                onClick: handleDeleteCollection,
                variant: 'danger' as const,
            },
        ],
        [handleEditCollection, handleDeleteCollection]
    );

    return (
        <div className="flex gap-6 h-full">
            {/* Left Collections Tree */}
            <div className="w-72 flex flex-col gap-4">
                <div className="bg-surface-secondary rounded-xl p-3 flex-1 flex flex-col overflow-hidden">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-base font-semibold text-text-primary">Collections</h2>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="sm"
                                icon={<RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />}
                                onClick={() => refetch()}
                                disabled={isLoading}
                                title="Refresh"
                            />
                            <Button
                                variant="primary"
                                size="sm"
                                icon={<FolderPlus className="w-3.5 h-3.5" />}
                                onClick={handleCreateCollection}
                            >
                                New
                            </Button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {isLoading ? (
                            <Loader size="sm" message="Loading..." />
                        ) : (
                            <TreeView
                                nodes={treeNodes}
                                selectedId={selectedCollectionId}
                                onSelect={handleCollectionSelect}
                                actions={treeActions}
                                emptyMessage="No collections yet. Create one to get started!"
                                expandedNodeIds={expandedNodeIds}
                            />
                        )}
                    </div>
                </div>
            </div>

            {/* Right Content Area */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {selectedCollection ? (
                    <>
                        <div className="mb-6">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                                    <div
                                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                                        style={{ backgroundColor: selectedCollection.color || 'var(--color-accent-primary)' }}
                                    >
                                        <Plus size={20} color="white" />
                                    </div>
                                    <div>
                                        <h1 className="text-2xl font-bold text-text-primary">
                                            {selectedCollection.name}
                                        </h1>
                                        {selectedCollection.description && (
                                            <p className="text-sm text-text-secondary mt-1">
                                                {selectedCollection.description}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        icon={<FolderPlus className="w-4 h-4" />}
                                        onClick={() => {
                                            setParentIdForNewCollection(selectedCollectionId);
                                            setIsCreateCollectionOpen(true);
                                        }}
                                    >
                                        Add Subcollection
                                    </Button>
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        icon={<FilePlus className="w-4 h-4" />}
                                        onClick={() => setIsFilePickerOpen(true)}
                                    >
                                        Add Files
                                    </Button>
                                    <div className="flex items-center gap-1 bg-surface-secondary rounded-lg p-1">
                                        <Button
                                            variant={viewMode === 'grid' ? 'primary' : 'ghost'}
                                            size="sm"
                                            icon={<Grid3x3 className="w-4 h-4" />}
                                            onClick={() => setViewMode('grid')}
                                            title="Grid View"
                                        />
                                        <Button
                                            variant={viewMode === 'list' ? 'primary' : 'ghost'}
                                            size="sm"
                                            icon={<List className="w-4 h-4" />}
                                            onClick={() => setViewMode('list')}
                                            title="List View"
                                        />
                                    </div>
                                </div>
                            </div>
                            <p className="text-sm text-text-secondary">
                                {totalItems} {totalItems === 1 ? 'item' : 'items'}
                            </p>
                        </div>

                        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar pb-4">
                            {totalItems === 0 ? (
                                <div className="flex items-center justify-center h-64">
                                    <div className="text-center">
                                        <p className="text-text-secondary mb-2">No files or folders in this collection</p>
                                        <p className="text-sm text-text-muted">
                                            Add files from the Files page or create subcollections
                                        </p>
                                    </div>
                                </div>
                            ) : viewMode === 'grid' ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {allItems.map((item) =>
                                        item.type === 'collection' ? (
                                            <CollectionCard
                                                key={item.id}
                                                collection={item}
                                                onDoubleClick={() => handleCollectionSelect({ id: item.id, label: item.name } as TreeNode)}
                                                onEdit={handleEditCollection}
                                                onDelete={(col) => handleDeleteCollection({ id: col.id, label: col.name, data: col } as TreeNode)}
                                                onAddSubcollection={(col) => {
                                                    setParentIdForNewCollection(col.id);
                                                    setIsCreateCollectionOpen(true);
                                                }}
                                            />
                                        ) : item.file ? (
                                            <FileCard
                                                key={item.fileId}
                                                file={item.file}
                                                onDelete={handleDeleteFile}
                                                onRemoveFromCollection={handleRemoveFromCollection}
                                                showRemoveFromCollection
                                            />
                                        ) : null
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {allItems.map((item) =>
                                        item.type === 'collection' ? (
                                            <div
                                                key={item.id}
                                                className="group p-4 rounded-lg border border-accent-primary/30 bg-surface-secondary hover:bg-surface-tertiary hover:border-accent-primary transition-all duration-200 cursor-pointer"
                                                onDoubleClick={() => handleCollectionSelect({ id: item.id, label: item.name } as TreeNode)}
                                            >
                                                <div className="flex items-center gap-4">
                                                    {/* Icon & Name Section */}
                                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                                        <div
                                                            className="shrink-0 w-12 h-12 rounded-lg flex items-center justify-center border border-divider bg-surface-tertiary/50"
                                                        >
                                                            <Folder
                                                                size={22}
                                                                strokeWidth={2}
                                                                style={{ color: collectionColor(item.color) }}
                                                            />
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-sm font-semibold text-text-primary group-hover:text-accent-primary truncate transition-colors duration-200">
                                                                {item.name}
                                                            </p>
                                                            <p className="text-xs text-text-muted">
                                                                {item.fileCount} files
                                                                {item.childCount > 0 && ` • ${item.childCount} folders`}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {/* Metadata Section */}
                                                    <div className="hidden md:flex items-center gap-6 shrink-0">
                                                        {/* Date */}
                                                        <div className="flex flex-col items-center gap-1 min-w-[80px]">
                                                            <span className="text-xs text-text-muted uppercase">Created</span>
                                                            <span className="text-xs font-medium text-text-secondary">
                                                                {new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                            </span>
                                                        </div>

                                                        {/* Type Badge */}
                                                        <div className="flex flex-col items-center gap-1 min-w-[70px]">
                                                            <span className="text-xs text-text-muted uppercase">Type</span>
                                                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent-primary">
                                                                <Folder className="w-3 h-3" />
                                                                Folder
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Actions Section */}
                                                    <div className="flex items-center gap-1 shrink-0 opacity-0 md:group-hover:opacity-100 transition-opacity duration-200">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            icon={<Pencil className="w-4 h-4" />}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleEditCollection(item);
                                                            }}
                                                            title="Edit"
                                                        />
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            icon={<FolderPlus className="w-4 h-4" />}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setParentIdForNewCollection(item.id);
                                                                setIsCreateCollectionOpen(true);
                                                            }}
                                                            title="Add Subcollection"
                                                        />
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            icon={<Trash2 className="w-4 h-4" />}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDeleteCollection({ id: item.id, label: item.name, data: item } as TreeNode);
                                                            }}
                                                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                                            title="Delete"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        ) : item.file ? (
                                            <FileTableRow
                                                key={item.fileId}
                                                file={item.file}
                                                onDelete={handleDeleteFile}
                                            />
                                        ) : null
                                    )}
                                </div>
                            )}
                        </div>

                        {hasNextPage && (
                            <div className="flex justify-center pt-3">
                                <Button variant="secondary" size="md" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                                    {isFetchingNextPage ? 'Loading...' : 'Load more'}
                                </Button>
                            </div>
                        )}
                    </>
                ) : selectedCollectionId && isLoadingCollection ? (
                    <Loader size="lg" message="Loading collection..." />
                ) : isLoading ? (
                    <Loader size="lg" message="Loading collections..." />
                ) : !selectedCollectionId && rootCollections && rootCollections.length > 0 ? (
                    <>
                        <div className="mb-6">
                            <h1 className="text-2xl font-bold text-text-primary mb-2">
                                All Collections
                            </h1>
                            <p className="text-sm text-text-secondary">
                                {rootCollections.length} {rootCollections.length === 1 ? 'collection' : 'collections'}
                            </p>
                        </div>
                        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar pb-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {rootCollections.map((collection) => (
                                    <CollectionCard
                                        key={collection.id}
                                        collection={collection}
                                        onDoubleClick={() => handleCollectionSelect({ id: collection.id, label: collection.name } as TreeNode)}
                                        onEdit={handleEditCollection}
                                        onDelete={(col) => handleDeleteCollection({ id: col.id, label: col.name, data: col } as TreeNode)}
                                        onAddSubcollection={(col) => {
                                            setParentIdForNewCollection(col.id);
                                            setIsCreateCollectionOpen(true);
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center max-w-md">
                            <FolderPlus className="w-16 h-16 mx-auto mb-4 text-text-muted" />
                            <h2 className="text-xl font-semibold text-text-primary mb-2">
                                No Collections Yet
                            </h2>
                            <p className="text-text-secondary mb-4">
                                Create your first collection to organize your files
                            </p>
                            <Button
                                variant="primary"
                                icon={<Plus className="w-4 h-4" />}
                                onClick={handleCreateCollection}
                            >
                                Create Your First Collection
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Dialogs */}
            <CreateCollectionDialog
                isOpen={isCreateCollectionOpen}
                onClose={() => {
                    setIsCreateCollectionOpen(false);
                    setParentIdForNewCollection(undefined);
                    setCollectionToEdit(null);
                }}
                parentId={parentIdForNewCollection}
                collection={collectionToEdit || undefined}
            />
            <DeleteCollectionDialog
                isOpen={isDeleteCollectionOpen}
                onClose={() => {
                    setIsDeleteCollectionOpen(false);
                    setCollectionToDelete(null);
                }}
                collection={collectionToDelete}
                onDeleteSuccess={handleDeleteSuccess}
            />
            <FilePickerModal
                isOpen={isFilePickerOpen}
                onClose={() => setIsFilePickerOpen(false)}
                onSelectFiles={handleAddFilesToCollection}
                selectedFileIds={allItems.flatMap((item) => (item.type === 'file' ? [item.fileId] : []))}
                title="Add Files to Collection"
                description="Select files to add to this collection"
                confirmButtonText="Add"
            />

            {/* Delete File Confirmation Dialog */}
            <ConfirmDialog
                isOpen={fileToDelete !== null}
                onClose={() => setFileToDelete(null)}
                onConfirm={confirmDeleteFile}
                title="Delete File"
                message="Are you sure you want to delete this file? This action cannot be undone and the file cannot be recovered."
                confirmText="Delete"
                cancelText="Cancel"
                variant="danger"
                isLoading={deleteFile.isPending}
            />

            {/* Remove File from Collection Confirmation Dialog */}
            <ConfirmDialog
                isOpen={fileToRemove !== null}
                onClose={() => setFileToRemove(null)}
                onConfirm={confirmRemoveFromCollection}
                title="Remove File from Collection"
                message="Are you sure you want to remove this file from the collection? The file itself will not be deleted."
                confirmText="Remove"
                cancelText="Cancel"
                variant="warning"
                isLoading={removeFilesFromCollection.isPending}
            />
        </div>
    );
};

export default CollectionsPage;
