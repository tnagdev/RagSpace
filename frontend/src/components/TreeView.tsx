import React, { useState, useRef, useEffect } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TreeNode {
    id: string;
    label: string;
    icon?: React.ReactNode;
    color?: string;
    badge?: string | number;
    children?: TreeNode[];
    hasChildren?: boolean;
    data?: any;
}

export interface TreeAction {
    label: string;
    icon?: React.ReactNode;
    onClick: (node: TreeNode) => void;
    variant?: 'default' | 'danger';
}

interface TreeNodeComponentProps {
    node: TreeNode;
    level?: number;
    selectedId?: string;
    onSelect: (node: TreeNode) => void;
    onExpand?: (node: TreeNode) => void;
    actions?: TreeAction[];
    defaultExpanded?: boolean;
    loadedNodes?: Set<string>;
    disableLazyLoading?: boolean;
    expandedNodeIds?: Set<string>;
}

const TreeNodeComponent: React.FC<TreeNodeComponentProps> = ({
    node,
    level = 0,
    selectedId,
    onSelect,
    onExpand,
    actions,
    defaultExpanded = false,
    loadedNodes,
    disableLazyLoading = false,
    expandedNodeIds,
}) => {
    const [isExpanded, setIsExpanded] = useState(expandedNodeIds?.has(node.id) ?? defaultExpanded);
    const [showMenu, setShowMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const hasChildren = node.hasChildren || (node.children && node.children.length > 0);
    const isSelected = node.id === selectedId;
    const isLoaded = loadedNodes?.has(node.id);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setShowMenu(false);
            }
        };

        if (showMenu) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showMenu]);

    const handleToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        const newExpanded = !isExpanded;
        setIsExpanded(newExpanded);

        if (newExpanded && !isLoaded && onExpand) {
            onExpand(node);
        }
    };

    return (
        <div>
            <div
                className={cn(
                    'group flex items-center gap-1.5 px-1.5 py-1 rounded cursor-pointer transition-colors text-sm',
                    isSelected
                        ? 'bg-accent-primary/10 text-accent-primary'
                        : 'text-text-primary hover:bg-sidebar-hover'
                )}
                style={{ paddingLeft: level === 0 ? '6px' : `${level * 12 + 6}px` }}
                onClick={() => onSelect(node)}
            >
                {hasChildren ? (
                    <button
                        onClick={handleToggle}
                        className="shrink-0 p-0.5 hover:bg-white/5 rounded transition-colors"
                    >
                        {isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                        )}
                    </button>
                ) : (
                    <div className="w-4" />
                )}

                {node.icon ? (
                    <div className="shrink-0">{node.icon}</div>
                ) : (
                    <div className="shrink-0">
                        {isExpanded && hasChildren ? (
                            <FolderOpen
                                className="w-4 h-4"
                                style={{ color: node.color || 'var(--color-accent-primary)' }}
                            />
                        ) : (
                            <Folder
                                className="w-4 h-4"
                                style={{ color: node.color || 'var(--color-accent-primary)' }}
                            />
                        )}
                    </div>
                )}

                <span className="flex-1 truncate font-normal">{node.label}</span>

                {node.badge !== undefined && (
                    <span
                        className={cn(
                            'text-xs px-1.5 py-0.5 rounded-md shrink-0',
                            isSelected
                                ? 'bg-accent-primary/20 text-accent-primary'
                                : 'bg-bg-secondary text-text-muted'
                        )}
                    >
                        {typeof node.badge === 'number' ? `${node.badge} files` : node.badge}
                    </span>
                )}

                {actions && actions.length > 0 && (
                    <div className="relative" ref={menuRef}>
                        <button
                            className={cn(
                                'shrink-0 p-0.5 rounded transition-all',
                                showMenu ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                                'hover:bg-white/10'
                            )}
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowMenu(!showMenu);
                            }}
                        >
                            <MoreVertical className="w-3.5 h-3.5" />
                        </button>

                        {showMenu && (
                            <div className="absolute right-0 top-full mt-1 w-44 bg-bg-secondary border border-sidebar-border rounded-lg shadow-xl z-20 py-1">
                                {actions.map((action, index) => (
                                    <button
                                        key={index}
                                        className={cn(
                                            'w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors text-left',
                                            action.variant === 'danger'
                                                ? 'text-status-error hover:bg-status-error/10'
                                                : 'text-text-secondary hover:text-text-primary hover:bg-sidebar-hover'
                                        )}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            action.onClick(node);
                                            setShowMenu(false);
                                        }}
                                    >
                                        {action.icon && <span className="shrink-0">{action.icon}</span>}
                                        {action.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {hasChildren && isExpanded && node.children && (
                <div>
                    {node.children.map((child) => (
                        <TreeNodeComponent
                            key={child.id}
                            node={child}
                            level={level + 1}
                            selectedId={selectedId}
                            onSelect={onSelect}
                            onExpand={onExpand}
                            actions={actions}
                            defaultExpanded={defaultExpanded}
                            loadedNodes={loadedNodes}
                            disableLazyLoading={disableLazyLoading}
                            expandedNodeIds={expandedNodeIds}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

interface TreeViewProps {
    nodes: TreeNode[];
    selectedId?: string;
    onSelect: (node: TreeNode) => void;
    onExpand?: (node: TreeNode) => void;
    actions?: TreeAction[];
    defaultExpanded?: boolean;
    emptyMessage?: string;
    loadedNodes?: Set<string>;
    disableLazyLoading?: boolean;
    expandedNodeIds?: Set<string>;
}

export const TreeView: React.FC<TreeViewProps> = ({
    nodes,
    selectedId,
    onSelect,
    onExpand,
    actions,
    defaultExpanded = false,
    emptyMessage = 'No items to display',
    loadedNodes,
    disableLazyLoading = false,
    expandedNodeIds,
}) => {
    if (nodes.length === 0) {
        return (
            <div className="text-center py-8 text-sm text-text-muted">
                {emptyMessage}
            </div>
        );
    }

    return (
        <div className="space-y-0.5">
            {nodes.map((node) => (
                <TreeNodeComponent
                    key={node.id}
                    node={node}
                    level={0}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    onExpand={onExpand}
                    actions={actions}
                    defaultExpanded={defaultExpanded}
                    loadedNodes={loadedNodes}
                    disableLazyLoading={disableLazyLoading}
                    expandedNodeIds={expandedNodeIds}
                />
            ))}
        </div>
    );
};
