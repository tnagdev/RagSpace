import React, { useState } from 'react';
import { FolderPlus, Folder } from 'lucide-react';
import Button from '@/components/Button';
import { Drawer } from '@/components/Drawer';
import { useCollectionsFlat, useAddFilesToCollection } from '@/hooks/useCollection';
import { cn } from '@/lib/utils';

interface CollectionSidePanelProps {
    isOpen: boolean;
    onClose: () => void;
    fileIds: string[];
}

export const CollectionSidePanel: React.FC<CollectionSidePanelProps> = ({
    isOpen,
    onClose,
    fileIds,
}) => {
    const [selectedCollectionId, setSelectedCollectionId] = useState<string>('');
    const { data } = useCollectionsFlat({ enabled: isOpen });
    const collections = data?.collections || [];
    const addFilesToCollection = useAddFilesToCollection();

    // Reset state when drawer closes
    const handleClose = () => {
        setSelectedCollectionId('');
        onClose();
    };

    const handleSubmit = async () => {
        if (!selectedCollectionId) return;

        addFilesToCollection.mutate(
            {
                collectionId: selectedCollectionId,
                data: { fileIds },
            },
            {
                onSuccess: () => {
                    handleClose();
                },
            }
        );
    };

    const footer = (
        <div className="flex gap-2 justify-end p-4 bg-bg-secondary">
            <Button
                variant="secondary"
                onClick={handleClose}
                disabled={addFilesToCollection.isPending}
                size="sm"
            >
                Cancel
            </Button>
            <Button
                variant="primary"
                onClick={handleSubmit}
                disabled={!selectedCollectionId || addFilesToCollection.isPending}
                loading={addFilesToCollection.isPending}
                size="sm"
            >
                Add {selectedCollectionId ? '1' : ''} {selectedCollectionId ? (fileIds.length === 1 ? 'File' : 'Files') : 'to Collection'}
            </Button>
        </div>
    );

    return (
        <Drawer
            isOpen={isOpen}
            onClose={handleClose}
            title="Add to Collection"
            width="md"
            showFooter={true}
            footer={footer}
            showHeader={true}
            showCloseButton={true}
            closeOnOverlayClick={true}
            closeOnEscape={true}
            position="right"
            className="bg-bg-secondary!"
            contentClassName="!p-5 !pb-0"
        >
            <div className="mb-4">
                <p className="text-sm text-text-secondary">
                    Select a collection for {fileIds.length} {fileIds.length === 1 ? 'file' : 'files'}
                </p>
            </div>

            <div className="overflow-y-auto pr-2 custom-scrollbar" style={{ maxHeight: 'calc(100vh - 250px)' }}>
                {collections.length === 0 ? (
                    <div className="text-center py-12">
                        <FolderPlus className="w-12 h-12 mx-auto mb-4 text-text-muted" />
                        <p className="text-sm mb-2 text-text-secondary">No collections available</p>
                        <p className="text-xs text-text-muted">
                            Create a collection in the Collections page first
                        </p>
                    </div>
                ) : (
                    <div className="space-y-0.5">
                        {collections.map((collection) => (
                            <button
                                key={collection.id}
                                onClick={() => setSelectedCollectionId(collection.id)}
                                className={cn(
                                    'w-full flex items-center gap-1.5 px-1.5 py-1 rounded cursor-pointer transition-colors text-sm',
                                    selectedCollectionId === collection.id
                                        ? 'bg-accent-primary/10 text-accent-primary'
                                        : 'text-text-primary hover:bg-sidebar-hover'
                                )}
                            >
                                <div className="shrink-0">
                                    <Folder
                                        className="w-4 h-4"
                                        style={{ color: collection.color || 'var(--color-accent-primary)' }}
                                    />
                                </div>
                                <span className="flex-1 truncate font-normal text-left">{collection.name}</span>
                                {collection._count?.fileCollections !== undefined && (
                                    <span
                                        className={cn(
                                            'text-xs px-1.5 py-0.5 rounded-md shrink-0',
                                            selectedCollectionId === collection.id
                                                ? 'bg-accent-primary/20 text-accent-primary'
                                                : 'bg-bg-secondary text-text-muted'
                                        )}
                                    >
                                        {collection._count.fileCollections} files
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </Drawer>
    );
};
