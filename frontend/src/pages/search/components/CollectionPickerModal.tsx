import { useEffect, useState } from 'react';
import { Folder, Check } from 'lucide-react';
import Button from '@/components/Button';
import { Drawer } from '@/components/Drawer';
import { Collection } from '@/types/collection.types';
import { useCollectionsFlat } from '@/hooks/useCollection';
import { cn } from '@/lib/utils';

interface CollectionPickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectCollections: (collections: Collection[]) => void;
    selectedCollectionIds: string[];
    title?: string;
    description?: string;
    confirmButtonText?: string;
}

const CollectionPickerModal: React.FC<CollectionPickerModalProps> = ({
    isOpen,
    onClose,
    selectedCollectionIds,
    onSelectCollections,
    title = 'Attach Collections',
    description = 'Select collections to search within. All files in nested collections will be included.',
    confirmButtonText = 'Attach',
}) => {
    const [localSelected, setLocalSelected] = useState<Set<string>>(new Set(selectedCollectionIds));

    useEffect(() => {
        if (isOpen) {
            setLocalSelected(new Set(selectedCollectionIds));
        } else {
            setLocalSelected(new Set());
        }
    }, [selectedCollectionIds, isOpen]);

    const { data, isLoading } = useCollectionsFlat({ enabled: isOpen });

    const toggleCollection = (collection: Collection) => {
        // Don't allow toggling collections that are already attached
        if (selectedCollectionIds.includes(collection.id)) return;

        const newSelected = new Set(localSelected);
        if (newSelected.has(collection.id)) {
            newSelected.delete(collection.id);
        } else {
            newSelected.add(collection.id);
        }
        setLocalSelected(newSelected);
    };

    const handleConfirm = () => {
        const collections = data?.collections.filter(c => localSelected.has(c.id)) || [];
        onSelectCollections(collections);
        onClose();
    };

    return (
        <Drawer
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            position="right"
            width="md"
            showFooter={true}
            className="!bg-bg-secondary"
            contentClassName="!p-5 !pb-0 !flex !flex-col !h-full"
            footer={
                <div className="flex gap-2 justify-end p-4 bg-bg-secondary">
                    <Button variant="secondary" onClick={onClose} size="sm">
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={handleConfirm}
                        disabled={localSelected.size === 0}
                    >
                        {confirmButtonText} {localSelected.size > 0 ? `${localSelected.size} ${localSelected.size === 1 ? 'Collection' : 'Collections'}` : 'Collections'}
                    </Button>
                </div>
            }
        >
            <div className="mb-4 flex-shrink-0">
                <p className="text-sm text-text-secondary">
                    {description}
                </p>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar min-h-0">
                {isLoading ? (
                    <div className="flex items-center justify-center h-32">
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-8 h-8 border-4 border-accent-primary/30 border-t-accent-primary rounded-full animate-spin"></div>
                            <p className="text-sm text-text-muted">Loading collections...</p>
                        </div>
                    </div>
                ) : data?.collections && data.collections.length > 0 ? (
                    <div className="space-y-2">
                        {data.collections.map((collection) => {
                            const isAlreadyAdded = selectedCollectionIds.includes(collection.id);
                            const isSelected = localSelected.has(collection.id);
                            const fileCount = collection._count?.fileCollections || 0;

                            return (
                                <button
                                    key={collection.id}
                                    onClick={() => toggleCollection(collection)}
                                    disabled={isAlreadyAdded}
                                    className={cn(
                                        "w-full flex items-center gap-3 p-3 rounded-lg transition-all text-left group",
                                        "border",
                                        isAlreadyAdded
                                            ? "bg-bg-tertiary/50 border-border-input opacity-60 cursor-not-allowed"
                                            : isSelected
                                                ? "bg-accent-primary/10 border-accent-primary"
                                                : "bg-bg-tertiary/30 border-border-input hover:border-accent-primary/50"
                                    )}
                                >
                                    {/* Collection Icon */}
                                    <div
                                        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                                        style={{
                                            backgroundColor: collection.color
                                                ? `${collection.color}20`
                                                : 'var(--color-accent-primary-10)'
                                        }}
                                    >
                                        <Folder
                                            className="w-5 h-5"
                                            style={{
                                                color: collection.color || 'var(--color-accent-primary)'
                                            }}
                                        />
                                    </div>

                                    {/* Collection Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-text-primary truncate">
                                            {collection.name}
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
                                            <span>{fileCount} {fileCount === 1 ? 'file' : 'files'}</span>
                                            {collection.description && (
                                                <>
                                                    <span>•</span>
                                                    <span className="truncate">{collection.description}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {/* Selection Indicator */}
                                    <div className={cn(
                                        "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all",
                                        isAlreadyAdded
                                            ? "bg-bg-tertiary border-border-input"
                                            : isSelected
                                                ? "bg-accent-primary border-accent-primary"
                                                : "border-border-input group-hover:border-accent-primary/50"
                                    )}>
                                        {(isSelected || isAlreadyAdded) && (
                                            <Check className="w-3 h-3 text-white" />
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-48 text-center">
                        <Folder className="w-12 h-12 text-text-muted mb-4" />
                        <p className="text-sm text-text-secondary mb-2">No collections found</p>
                        <p className="text-xs text-text-muted max-w-xs">
                            Create collections in the Collections page to organize your files
                        </p>
                    </div>
                )}
            </div>
        </Drawer>
    );
};

export default CollectionPickerModal;
