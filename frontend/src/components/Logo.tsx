import { type FC } from 'react';

interface LogoProps {
  className?: string;
  collapsed?: boolean;
  showText?: boolean;
}

export const Logo: FC<LogoProps> = ({ className, collapsed = false, showText = true }) => {
  return (
    <div className={`flex items-center gap-3 ${className || ''}`}>
      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[var(--gradient-primary-start)] to-[var(--gradient-primary-end)] flex items-center justify-center font-bold text-lg text-white shadow-lg">
        R
      </div>
      {showText && !collapsed && (
        <span className="font-semibold text-lg text-text-primary whitespace-nowrap">
          RagSpace
        </span>
      )}
    </div>
  );
};