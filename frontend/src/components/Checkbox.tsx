import React, { type ReactNode } from 'react';

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
    label?: ReactNode;
    name: string;
    value: string;
    checked: boolean;
    onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
    size?: 'sm' | 'md' | 'lg';
    error?: boolean;
    className?: string;
    labelClassName?: string;
}

const Checkbox: React.FC<CheckboxProps> = ({
    label,
    name,
    value,
    checked,
    onChange,
    size = 'md',
    error = false,
    disabled = false,
    className = '',
    labelClassName = '',
    ...props
}) => {
    const getSizeClasses = () => {
        switch (size) {
            case 'sm':
                return { checkbox: 'w-4 h-4', label: 'text-sm', gap: 'gap-2' };
            case 'lg':
                return { checkbox: 'w-6 h-6', label: 'text-lg', gap: 'gap-3' };
            default: // md
                return { checkbox: 'w-5 h-5', label: 'text-base', gap: 'gap-2.5' };
        }
    };

    const sizeClasses = getSizeClasses();

    return (
        <label
            className={`
        flex items-center cursor-pointer transition-all duration-200
        ${sizeClasses.gap}
        ${disabled ? 'cursor-not-allowed opacity-50' : 'hover:opacity-90'}
        ${className}
      `}
        >
            <div
                className={`
          relative flex items-center justify-center rounded-md transition-all duration-200
          ${sizeClasses.checkbox}
          ${checked ? 'bg-accent-primary' : 'bg-white border border-gray-300'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${error ? 'border-red-400' : ''}
        `}
            >
                {checked && (
                    <svg
                        className="w-3 h-3 text-white"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                )}
                <input
                    type="checkbox"
                    name={name}
                    value={value}
                    checked={checked}
                    onChange={onChange}
                    disabled={disabled}
                    className="absolute w-full h-full opacity-0 cursor-pointer m-0 p-0"
                    {...props}
                />
            </div>
            {label && (
                <span
                    className={`
            select-none text-gray-700
            ${sizeClasses.label}
            ${disabled ? 'text-gray-400' : ''}
            ${labelClassName}
          `}
                >
                    {label}
                </span>
            )}
        </label>
    );
};

export default Checkbox;
