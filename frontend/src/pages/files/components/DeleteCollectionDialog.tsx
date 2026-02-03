import React, { useState } from 'react';
import { Modal } from '@/components/Modal';
import Button from '@/components/Button';
import Checkbox from '@/components/Checkbox';
import { useDeleteCollection } from '@/hooks/useCollection';
import type { Collection } from '@/types/collection.types';
import { AlertTriangle } from 'lucide-react';

interface DeleteCollectionDialogProps {
    isOpen: boolean;
    onClose: () => void;
    collection: Collection | null;
    onDeleteSuccess?: () => void;
}

export const DeleteCollectionDialog: React.FC<
    DeleteCollectionDialogProps
> = ({ isOpen, onClose, collection, onDeleteSuccess }) => {
    const [deleteFiles, setDeleteFiles] = useState(false);
    const deleteCollection = useDeleteCollection();

    const handleDelete = async () => {
        if (!collection) return;

        deleteCollection.mutate(
            {
                collectionId: collection.id,
                deleteFiles,
            },
            {
                onSuccess: () => {
                    setDeleteFiles(false);
                    onDeleteSuccess?.();
                    onClose();
                },
            },
        );
    };

    const fileCount = collection?._count?.fileCollections || 0;
    const childCount = collection?._count?.children || 0;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Delete Collection"
            size="md"
            showFooter={false}
        >
            <div className="space-y-5">
                {/* Warning banner */}
                <div className="flex gap-3.5 py-4 rounded-lg bg-status-warning/8">
                    <AlertTriangle
                        className="shrink-0 text-status-warning mt-1.5"
                        size={25}
                    />
                    <div className="flex-1">
                        <p className="font-medium mb-1 text-text-primary leading-snug">
                            Are you sure you want to delete "{collection?.name}"?
                        </p>
                        <p className="text-sm text-text-secondary leading-relaxed">
                            {childCount > 0 && (
                                <>
                                    This will also delete {childCount} nested collection
                                    {childCount > 1 ? 's' : ''}.{' '}
                                </>
                            )}
                            {fileCount > 0 && (
                                <>
                                    This collection contains {fileCount} file
                                    {fileCount > 1 ? 's' : ''}.
                                </>
                            )}
                        </p>
                    </div>
                </div>

                {/* Delete files option */}
                {fileCount > 0 && (
                    <div className="space-y-2">
                        <Checkbox
                            name="deleteFiles"
                            value="deleteFiles"
                            checked={deleteFiles}
                            onChange={(e) => setDeleteFiles(e.target.checked)}
                            label="Also delete files that belong only to this collection"
                            labelClassName="text-sm font-medium text-accent-primary!"
                        />
                        <p className="text-xs ml-7 leading-relaxed text-text-muted">
                            Files that are part of other collections will not be deleted.
                        </p>
                    </div>
                )}

                {/* Action buttons */}
                <div className="flex justify-end gap-3 pt-1">
                    <Button
                        variant="secondary"
                        onClick={onClose}
                        disabled={deleteCollection.isPending}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="danger"
                        onClick={handleDelete}
                        disabled={deleteCollection.isPending}
                        loading={deleteCollection.isPending}
                    >
                        Delete Collection
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
