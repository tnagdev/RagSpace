
import { ButtonHTMLAttributes, ReactNode, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success' | 'social';
    size?: 'sm' | 'md' | 'lg' | 'xl';
    fullWidth?: boolean;
    icon?: ReactNode;
    iconPosition?: 'left' | 'right';
    loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    (
        {
            className,
            children,
            variant = 'primary',
            size = 'md',
            fullWidth = false,
            icon,
            iconPosition = 'left',
            loading = false,
            disabled,
            ...props
        },
        ref
    ) => {
        const baseStyles = 'inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none';

        const variants = {
            primary: 'bg-gradient-to-r from-[var(--gradient-primary-start)] to-[var(--gradient-primary-end)] hover:from-[var(--color-accent-primary-hover)] hover:to-[var(--gradient-primary-end)] text-white shadow-lg',
            secondary: 'bg-bg-input hover:bg-bg-hover text-text-primary border border-[var(--color-border-input)]',
            outline: 'bg-transparent border-2 border-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary)] hover:text-white text-[var(--color-accent-primary)]',
            ghost: 'bg-transparent hover:bg-[var(--color-sidebar-hover)] text-text-primary',
            danger: 'bg-[var(--color-danger)] hover:bg-[var(--color-danger)]/90 text-white shadow-lg',
            success: 'bg-[var(--color-success)] hover:bg-[var(--color-success)]/90 text-white shadow-lg',
            social: 'bg-bg-secondary border border-[var(--color-sidebar-border)] hover:bg-bg-tertiary hover:border-[var(--color-accent-primary)] text-text-primary',
        };

        const sizes = {
            sm: 'px-3 py-1.5 text-sm rounded-lg',
            md: 'px-4 py-2.5 text-base rounded-xl',
            lg: 'px-6 py-3 text-lg rounded-xl',
            xl: 'px-8 py-4 text-xl rounded-2xl',
        };

        return (
            <button
                ref={ref}
                disabled={disabled || loading}
                className={cn(
                    baseStyles,
                    variants[variant],
                    sizes[size],
                    fullWidth && 'w-full',
                    className
                )}
                {...props}
            >
                {loading ? (
                    <>
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        <span>Loading...</span>
                    </>
                ) : (
                    <>
                        {icon && iconPosition === 'left' && <span className="flex-shrink-0">{icon}</span>}
                        {children}
                        {icon && iconPosition === 'right' && <span className="flex-shrink-0">{icon}</span>}
                    </>
                )}
            </button>
        );
    }
);

Button.displayName = 'Button';

export default Button;