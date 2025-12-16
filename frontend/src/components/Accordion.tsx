import React, { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

export interface AccordionItemProps {
    id: string;
    title: ReactNode;
    children: React.ReactNode;
    defaultOpen?: boolean;
}

export interface AccordionProps {
    items?: AccordionItemProps[];
    children?: React.ReactNode;
    allowMultiple?: boolean;
    className?: string;
    itemClassName?: string;
    headerClassName?: string;
    contentClassName?: string;
}

interface AccordionItemComponentProps extends AccordionItemProps {
    isOpen: boolean;
    onToggle: () => void;
    headerClassName?: string;
    contentClassName?: string;
    itemClassName?: string;
}

const AccordionItem: React.FC<AccordionItemComponentProps> = ({
    title,
    children,
    isOpen,
    onToggle,
    headerClassName,
    contentClassName,
    itemClassName,
}) => {
    return (
        <div className={twMerge('border border-gray-200 rounded-lg overflow-hidden', itemClassName)}>
            <button
                onClick={onToggle}
                className={twMerge(
                    'w-full flex items-center justify-between p-4 text-left transition-colors',
                    headerClassName
                )}
                aria-expanded={isOpen}
            >
                <span className="font-semibold text-gray-900">{title}</span>
                <ChevronDown
                    size={20}
                    className={twMerge(
                        'text-gray-500 transition-transform duration-300',
                        isOpen && 'rotate-180'
                    )}
                />
            </button>
            <div
                className={twMerge(
                    'overflow-hidden transition-all duration-300 ease-in-out',
                    isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
                )}
            >
                <div className={twMerge('border-t border-gray-200', contentClassName)}>
                    {children}
                </div>
            </div>
        </div>
    );
};

export const Accordion: React.FC<AccordionProps> = ({
    items,
    children,
    allowMultiple = false,
    className,
    itemClassName,
    headerClassName,
    contentClassName,
}) => {
    const [openItems, setOpenItems] = useState<Set<string>>(() => {
        if (items) {
            const defaultOpen = items
                .filter(item => item.defaultOpen)
                .map(item => item.id);
            return new Set(defaultOpen);
        }
        return new Set();
    });

    const toggleItem = (id: string) => {
        setOpenItems(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                if (!allowMultiple) {
                    newSet.clear();
                }
                newSet.add(id);
            }
            return newSet;
        });
    };

    // If items array is provided, use that
    if (items && items.length > 0) {
        return (
            <div className={twMerge('space-y-2', className)}>
                {items.map((item) => (
                    <AccordionItem
                        key={item.id}
                        {...item}
                        isOpen={openItems.has(item.id)}
                        onToggle={() => toggleItem(item.id)}
                        headerClassName={headerClassName}
                        contentClassName={contentClassName}
                        itemClassName={itemClassName}
                    />
                ))}
            </div>
        );
    }

    // Otherwise, render children (for composition pattern)
    return (
        <div className={twMerge('space-y-2', className)}>
            {children}
        </div>
    );
};

// Composition components for more flexible usage
interface AccordionSingleItemProps {
    title: ReactNode;
    children: React.ReactNode;
    defaultOpen?: boolean;
    headerClassName?: string;
    contentClassName?: string;
    itemClassName?: string;
}

export const AccordionSingleItem: React.FC<AccordionSingleItemProps> = ({
    title,
    children,
    defaultOpen = false,
    headerClassName,
    contentClassName,
    itemClassName,
}) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <AccordionItem
            id="single"
            title={title}
            isOpen={isOpen}
            onToggle={() => setIsOpen(!isOpen)}
            headerClassName={headerClassName}
            contentClassName={contentClassName}
            itemClassName={itemClassName}
        >
            {children}
        </AccordionItem>
    );
};

export default Accordion;
