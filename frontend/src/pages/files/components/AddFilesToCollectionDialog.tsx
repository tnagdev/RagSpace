import React, { useState } from 'react';
import { Modal } from '@/components/Modal';
import Button from '@/components/Button';
import { useAddFilesToCollection, useCollectionsFlat } from '@/hooks/useCollection';

interface AddFilesToCollectionDialogProps {
    isOpen: boolean;
    onClose: () => void;
    fileIds: string[];
}

export const AddFilesToCollectionDialog: React.FC<
    AddFilesToCollectionDialogProps
> = ({ isOpen, onClose, fileIds }) => {
    const [selectedCollectionId, setSelectedCollectionId] = useState<string>('');

    const { data } = useCollectionsFlat({ enabled: isOpen });
    const collections = data?.collections || [];
    const addFilesToCollection = useAddFilesToCollection();

    const handleSubmit = async () => {
        if (!selectedCollectionId) return;

        addFilesToCollection.mutate(
            {
                collectionId: selectedCollectionId,
                data: { fileIds },
            },
            {
                onSuccess: () => {
                    setSelectedCollectionId('');
                    onClose();
                },
            },
        );
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Add ${fileIds.length} file${fileIds.length > 1 ? 's' : ''} to Collection`}
            size="md"
            showFooter={false}
        >
            <div className="space-y-4">
                {collections.length === 0 ? (
                    <div
                        className="text-center py-8"
                        style={{ color: 'var(--color-text-secondary)' }}
                    >
                        <p className="mb-4">No collections available.</p>
                        <p className="text-sm">Create a collection first to organize your files.</p>
                    </div>
                ) : (
                    <>
                        <div>
                            <label
                                htmlFor="select-collection"
                                className="block text-sm font-medium mb-2"
                                style={{ color: 'var(--color-text-primary)' }}
                            >
                                Select Collection
                            </label>
                            <select
                                id="select-collection"
                                value={selectedCollectionId}
                                onChange={(e) => setSelectedCollectionId(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border"
                                style={{
                                    backgroundColor: 'var(--color-bg-secondary)',
                                    borderColor: 'var(--color-border-primary)',
                                    color: 'var(--color-text-primary)',
                                }}
                                autoFocus
                            >
                                <option value="">Choose a collection...</option>
                                {collections.map((col) => (
                                    <option key={col.id} value={col.id}>
                                        {col.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex justify-end gap-3 pt-4">
                            <Button
                                variant="secondary"
                                onClick={onClose}
                                disabled={addFilesToCollection.isPending}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="primary"
                                onClick={handleSubmit}
                                disabled={!selectedCollectionId || addFilesToCollection.isPending}
                                loading={addFilesToCollection.isPending}
                            >
                                Add to Collection
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
};
