import { useState, useRef, useEffect } from 'react';
import { Search, Paperclip } from 'lucide-react';
import Button from '@/components/Button';
import { IconButton } from '@/components/IconButton';
import { cn } from '@/lib/utils';

interface SearchInputProps {
    onSearch: (query: string) => void;
    onAttachFiles?: (buttonRef: HTMLElement) => void;
    isLoading?: boolean;
}

const SearchInput: React.FC<SearchInputProps> = ({ onSearch, onAttachFiles, isLoading }) => {
    const [query, setQuery] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const attachButtonRef = useRef<HTMLButtonElement>(null);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (query.trim()) {
            onSearch(query.trim());
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
        }
    }, [query]);

    return (
        <form onSubmit={handleSubmit}>
            <div className="relative rounded-xl bg-bg-secondary/30 border overflow-hidden border-border-input hover:border-accent-primary focus-within:border-accent-primary transition-colors">
                <textarea
                    ref={textareaRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Describe what you're looking for..."
                    rows={2}
                    className={cn(
                        "w-full px-4 py-3 rounded-xl resize-none bg-transparent",
                        "text-text-primary placeholder:text-text-muted",
                        "focus:outline-none",
                        "transition-all duration-200",
                        "overflow-y-auto scrollbar-thin scrollbar-thumb-text-muted scrollbar-track-transparent custom-scrollbar"
                    )}
                    disabled={isLoading}
                    style={{ height: '68px', maxHeight: '150px' }}
                />
                <div className="px-4 pb-3 flex justify-between items-center">
                    {onAttachFiles && (
                        <IconButton
                            ref={attachButtonRef}
                            variant="ghost"
                            size="sm"
                            icon={<Paperclip size={16} />}
                            onClick={() => {
                                if (attachButtonRef.current) {
                                    onAttachFiles(attachButtonRef.current);
                                }
                            }}
                            className="text-text-muted hover:text-accent-primary"
                        />
                    )}
                    <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        icon={<Search size={16} />}
                        loading={isLoading}
                        disabled={!query.trim() || isLoading}
                    >
                        Search
                    </Button>
                </div>
            </div>
        </form>
    );
};

export default SearchInput;
