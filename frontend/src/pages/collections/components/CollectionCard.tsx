import { type FC, useState } from 'react';
import { Folder, MoreVertical, Pencil, Trash2, FolderPlus, Clock, File, MessageSquare } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import moment from 'moment';
import type { Collection } from '@/types/collection.types';
import Popover from '@/components/Popover';

interface CollectionCardProps {
    collection: Collection;
    onDoubleClick: (collection: Collection) => void;
    onEdit?: (collection: Collection) => void;
    onDelete?: (collection: Collection) => void;
    onAddSubcollection?: (collection: Collection) => void;
}

export const CollectionCard: FC<CollectionCardProps> = ({
    collection,
    onDoubleClick,
    onEdit,
    onDelete,
    onAddSubcollection
}) => {
    const [showMenu, setShowMenu] = useState(false);
    const [menuButtonRef, setMenuButtonRef] = useState<HTMLElement | null>(null);
    const navigate = useNavigate();

    const fileCount = collection._count?.fileCollections || 0;
    const folderCount = collection._count?.children || 0;

    return (
        <div
            className="group relative rounded-2xl border border-accent-primary/40 bg-bg-secondary/50 hover:bg-bg-secondary/70 hover:border-accent-primary/60 transition-all duration-300 overflow-hidden cursor-pointer"
            onDoubleClick={() => onDoubleClick(collection)}
        >
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-linear-to-br from-accent-primary/5 to-accent-secondary/5 pointer-events-none" />

            {/* Content */}
            <div className="relative p-5">
                {/* Header Section */}
                <div className="flex items-start justify-between mb-4">
                    {/* Folder Icon with color */}
                    <div
                        className="w-14 h-14 rounded-xl border border-sidebar-border/50 flex items-center justify-center group-hover:scale-105 transition-transform duration-300"
                        style={{
                            backgroundColor: collection.color || 'var(--color-accent-primary)',
                            opacity: 0.9
                        }}
                    >
                        <Folder className="w-7 h-7 text-white" />
                    </div>

                    {/* Actions Menu */}
                    <button
                        ref={setMenuButtonRef}
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowMenu(!showMenu);
                        }}
                        className="p-2 rounded-lg hover:bg-sidebar-hover transition-colors"
                    >
                        <MoreVertical className="w-4 h-4 text-text-muted group-hover:text-text-secondary transition-colors" />
                    </button>

                    <Popover
                        isOpen={showMenu}
                        onClose={() => setShowMenu(false)}
                        trigger={menuButtonRef}
                        className="w-48 py-1"
                    >
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                navigate({ to: `/collections/${collection.id}/chat` });
                                setShowMenu(false);
                            }}
                            className="w-full px-4 py-2.5 text-left text-sm text-text-secondary hover:text-text-primary hover:bg-sidebar-hover transition-all flex items-center gap-3"
                        >
                            <MessageSquare className="w-4 h-4" />
                            Chat
                        </button>
                        {onAddSubcollection && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onAddSubcollection(collection);
                                    setShowMenu(false);
                                }}
                                className="w-full px-4 py-2.5 text-left text-sm text-text-secondary hover:text-text-primary hover:bg-sidebar-hover transition-all flex items-center gap-3"
                            >
                                <FolderPlus className="w-4 h-4" />
                                Add Subcollection
                            </button>
                        )}
                        {onEdit && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onEdit(collection);
                                    setShowMenu(false);
                                }}
                                className="w-full px-4 py-2.5 text-left text-sm text-text-secondary hover:text-text-primary hover:bg-sidebar-hover transition-all flex items-center gap-3"
                            >
                                <Pencil className="w-4 h-4" />
                                Edit
                            </button>
                        )}
                        {onDelete && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete(collection);
                                    setShowMenu(false);
                                }}
                                className="w-full px-4 py-2.5 text-left text-sm text-red-400 hover:bg-red-500/10 transition-all flex items-center gap-3"
                            >
                                <Trash2 className="w-4 h-4" />
                                Delete
                            </button>
                        )}
                    </Popover>
                </div>

                {/* Collection Name */}
                <h3
                    className="text-base font-semibold text-text-primary truncate mb-1 group-hover:text-accent-primary transition-colors"
                    title={collection.name}
                >
                    {collection.name}
                </h3>

                {/* Collection Type and Stats Badges */}
                <div className="mb-4 flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium capitalize border border-sidebar-border/50"
                        style={{
                            background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.1), rgba(236, 72, 153, 0.1))',
                        }}
                    >
                        <Folder className="w-3.5 h-3.5 text-purple-400" />
                        Collection
                    </span>
                    {fileCount > 0 && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border border-sidebar-border/50 bg-blue-500/10">
                            <File className="w-3.5 h-3.5 text-blue-400" />
                            {fileCount}
                        </span>
                    )}
                    {folderCount > 0 && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border border-sidebar-border/50 bg-purple-500/10">
                            <Folder className="w-3.5 h-3.5 text-purple-400" />
                            {folderCount}
                        </span>
                    )}
                </div>

                {/* Collection Info Grid */}
                <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-text-muted flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5" />
                            Created
                        </span>
                        <span className="text-text-secondary font-medium truncate ml-2 max-w-[120px]" title={moment(collection.createdAt).fromNow()}>
                            {moment(collection.createdAt).fromNow()}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};
