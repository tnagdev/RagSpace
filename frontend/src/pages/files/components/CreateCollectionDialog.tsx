import React, { useState, useEffect } from 'react';
import { Drawer } from '@/components/Drawer';
import Button from '@/components/Button';
import { useCreateCollection, useCollectionsFlat } from '@/hooks/useCollection';
import type { CreateCollectionDto } from '@/types/collection.types';

interface CreateCollectionDialogProps {
    isOpen: boolean;
    onClose: () => void;
    parentId?: string;
}

const PRESET_COLORS = [
    '#ef4444', // red
    '#f97316', // orange
    '#eab308', // yellow
    '#22c55e', // green
    '#14b8a6', // teal
    '#3b82f6', // blue
    '#a855f7', // purple
    '#ec4899', // pink
];

export const CreateCollectionDialog: React.FC<
    CreateCollectionDialogProps
> = ({ isOpen, onClose, parentId }) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [color, setColor] = useState(PRESET_COLORS[6]); // Default to purple
    const [selectedParentId, setSelectedParentId] = useState<string | undefined>(
        parentId,
    );

    const { data } = useCollectionsFlat({ enabled: isOpen });
    const collections = data?.collections || [];
    const createCollection = useCreateCollection();

    // Reset form when drawer closes
    useEffect(() => {
        if (!isOpen) {
            setName('');
            setDescription('');
            setColor(PRESET_COLORS[6]);
            setSelectedParentId(undefined);
        } else if (parentId) {
            setSelectedParentId(parentId);
        }
    }, [isOpen, parentId]);

    const handleSubmit = async () => {
        if (!name.trim()) return;

        const data: CreateCollectionDto = {
            name: name.trim(),
            description: description.trim() || undefined,
            color,
            parentId: selectedParentId,
        };

        createCollection.mutate(data, {
            onSuccess: () => {
                onClose();
            },
        });
    };

    return (
        <Drawer
            isOpen={isOpen}
            onClose={onClose}
            title="Create Collection"
            position="right"
            width="md"
            showFooter={true}
            className="!bg-bg-secondary"
            contentClassName="!p-5 !pb-0 !flex !flex-col !h-full"
            footer={
                <div className="flex gap-3 justify-end p-4 bg-bg-secondary">
                    <Button
                        variant="secondary"
                        onClick={onClose}
                        disabled={createCollection.isPending}
                        size="sm"
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleSubmit}
                        disabled={!name.trim() || createCollection.isPending}
                        loading={createCollection.isPending}
                        size="sm"
                    >
                        Create Collection
                    </Button>
                </div>
            }
        >
            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar min-h-0">
                <div className="space-y-5">
                    <div>
                        <label
                            htmlFor="collection-name"
                            className="block text-sm font-medium mb-2 text-text-primary"
                        >
                            Name <span className="text-red-400">*</span>
                        </label>
                        <input
                            id="collection-name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Enter collection name"
                            className="w-full px-3 py-2.5 rounded-lg border bg-bg-tertiary border-border-input text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary transition-colors"
                            autoFocus
                        />
                    </div>

                    <div>
                        <label
                            htmlFor="collection-description"
                            className="block text-sm font-medium mb-2 text-text-primary"
                        >
                            Description
                        </label>
                        <textarea
                            id="collection-description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Enter description (optional)"
                            rows={3}
                            className="w-full px-3 py-2.5 rounded-lg border bg-bg-tertiary border-border-input text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary transition-colors resize-none custom-scrollbar"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2 text-text-primary">
                            Color
                        </label>
                        <div className="flex gap-2.5 flex-wrap">
                            {PRESET_COLORS.map((presetColor) => (
                                <button
                                    key={presetColor}
                                    type="button"
                                    onClick={() => setColor(presetColor)}
                                    className="w-9 h-9 rounded-lg transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 focus:ring-offset-bg-secondary"
                                    style={{
                                        backgroundColor: presetColor,
                                        border:
                                            color === presetColor
                                                ? '3px solid var(--color-accent-primary)'
                                                : '2px solid var(--color-border-input)',
                                        boxShadow: color === presetColor ? '0 0 0 2px var(--color-bg-secondary), 0 0 0 4px var(--color-accent-primary)' : 'none',
                                    }}
                                    aria-label={`Select color ${presetColor}`}
                                />
                            ))}
                        </div>
                    </div>

                    {!parentId && collections.length > 0 && (
                        <div>
                            <label
                                htmlFor="parent-collection"
                                className="block text-sm font-medium mb-2 text-text-primary"
                            >
                                Parent Collection
                            </label>
                            <select
                                id="parent-collection"
                                value={selectedParentId || ''}
                                onChange={(e) =>
                                    setSelectedParentId(e.target.value || undefined)
                                }
                                className="w-full px-3 py-2.5 rounded-lg border bg-bg-tertiary border-border-input text-text-primary focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary transition-colors"
                            >
                                <option value="">None (Root level)</option>
                                {collections.map((col) => (
                                    <option key={col.id} value={col.id}>
                                        {col.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>
            </div>
        </Drawer>
    );
};
