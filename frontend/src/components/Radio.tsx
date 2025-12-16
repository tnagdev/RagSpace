import React from 'react';

interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
    label?: string;
    name: string;
    value: string;
    checked: boolean;
    onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
    size?: 'sm' | 'md' | 'lg';
    error?: boolean;
    className?: string;
    labelClassName?: string;
}

const Radio: React.FC<RadioProps> = ({
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
                return {
                    radio: 'w-4 h-4 border-[5px]',
                    label: 'text-sm',
                    gap: 'gap-2'
                };
            case 'lg':
                return {
                    radio: 'w-6 h-6 border-[7px]',
                    label: 'text-lg',
                    gap: 'gap-3'
                };
            default: // md
                return {
                    radio: 'w-5 h-5 border-[6px]',
                    label: 'text-base',
                    gap: 'gap-2.5'
                };
        }
    };

    const sizeClasses = getSizeClasses();

    return (
        <label
            className={`
                flex items-center cursor-pointer transition-all duration-200
                ${sizeClasses.gap}
                ${disabled ? 'cursor-not-allowed opacity-50' : 'hover:opacity-80'}
                ${className}
            `}
        >
            <input
                type="radio"
                name={name}
                value={value}
                checked={checked}
                onChange={onChange}
                disabled={disabled}
                className={`
                    appearance-none border-2 border-gray-300 rounded-full transition-all duration-200 cursor-pointer
                    ${sizeClasses.radio}
                    ${!disabled ? 'hover:border-primary focus:border-primary' : 'cursor-not-allowed'}
                    ${checked ? 'border-primary bg-white' : ''}
                    focus:outline-none focus:shadow-[0_0_0_3px_rgba(239,28,36,0.08)]
                    ${error ? 'border-red-400' : ''}
                `}
                {...props}
            />
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
        </label>
    );
};

export default Radio;