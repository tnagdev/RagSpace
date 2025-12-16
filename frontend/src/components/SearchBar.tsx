import { type FC, type InputHTMLAttributes } from 'react';
import { Search, Command } from 'lucide-react';

interface SearchBarProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: 'sm' | 'md' | 'lg';
  showShortcut?: boolean;
}

export const SearchBar: FC<SearchBarProps> = ({
  size = 'md',
  showShortcut = true,
  className,
  placeholder = 'Search...',
  ...props
}) => {
  const sizeClasses = {
    sm: 'h-8 text-xs',
    md: 'h-10 text-sm',
    lg: 'h-12 text-base',
  };

  return (
    <div className={`relative w-full ${className || ''}`}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
      <input
        type="text"
        placeholder={placeholder}
        className={`w-full bg-bg-secondary/50 border border-sidebar-border rounded-lg pl-10 text-text-primary placeholder-text-muted focus:outline-none focus:bg-bg-tertiary focus:border-accent-primary transition-all ${sizeClasses[size]} ${showShortcut ? 'pr-16' : 'pr-4'}`}
        {...props}
      />
      {showShortcut && (
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-0.5 text-xs font-semibold text-text-secondary bg-bg-tertiary/50 border border-sidebar-border rounded flex items-center gap-1">
          <Command className="w-3 h-3" /> K
        </kbd>
      )}
    </div>
  );
};