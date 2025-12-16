import { type ButtonHTMLAttributes, type ReactNode, forwardRef } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode;
  badge?: boolean;
  variant?: 'ghost' | 'solid' | 'gradient';
  size?: 'sm' | 'md' | 'lg';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, badge, variant = 'ghost', size = 'md', className, children, ...props }, ref) => {
    const sizeClasses = {
      sm: 'w-7 h-7 p-1.5',
      md: 'w-9 h-9 p-2',
      lg: 'w-10 h-10 p-2.5',
    };

    const variantClasses = {
      ghost: 'hover:bg-[var(--color-sidebar-hover)] text-text-primary',
      solid: 'bg-bg-input hover:bg-bg-hover text-text-primary border border-[var(--color-sidebar-border)]',
      gradient: 'bg-gradient-to-br from-[var(--gradient-brand-start)] to-[var(--gradient-brand-end)] text-white shadow-lg hover:scale-110',
    };

    return (
      <button
        ref={ref}
        className={`relative rounded-lg flex items-center justify-center transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${sizeClasses[size]} ${variantClasses[variant]} ${className || ''}`}
        {...props}
      >
        {icon || children}
        {badge && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-gradient-primary-end rounded-full"></span>
        )}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';