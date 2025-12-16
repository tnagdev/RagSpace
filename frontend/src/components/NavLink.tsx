import { type FC, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';

interface NavLinkProps {
  to: string;
  icon?: ReactNode;
  label: string;
  isActive?: boolean;
  collapsed?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
}

export const NavLink: FC<NavLinkProps> = ({
  to,
  icon,
  label,
  isActive = false,
  collapsed = false,
  onClick,
  className,
}) => {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`
        group flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200
        ${isActive
          ? 'bg-gradient-to-r from-[var(--gradient-brand-start)] to-[var(--gradient-brand-end)] text-white shadow-lg'
          : 'text-text-secondary hover:bg-[var(--color-sidebar-hover)] hover:text-text-primary'
        }
        ${collapsed ? 'justify-center gap-0! w-fit' : ''}
        ${className || ''}
      `}
      title={collapsed ? label : ''}
    >
      {icon && (
        <span
          className={`w-5 h-5 flex-shrink-0 ${!isActive ? 'group-hover:scale-110 transition-transform' : ''}`}
        >
          {icon}
        </span>
      )}
      <span
        className={`font-medium text-sm whitespace-nowrap transition-all duration-300 ${collapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'}`}
      >
        {label}
      </span>
    </Link>
  );
};