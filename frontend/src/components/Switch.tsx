import React from 'react';

interface SwitchProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    size?: 'sm' | 'md' | 'lg';
    className?: string;
    id?: string;
    name?: string;
    label?: string;
}

const Switch: React.FC<SwitchProps> = ({
    checked,
    onChange,
    disabled = false,
    size = 'md',
    className = '',
    id,
    name,
    label
}) => {
    const handleToggle = () => {
        if (!disabled) {
            onChange(!checked);
        }
    };

    const getSizeClasses = () => {
        switch (size) {
            case 'sm':
                return {
                    container: 'w-8 h-4.5',
                    thumb: 'w-3.5 h-3.5',
                    translate: checked ? 'translate-x-3.5' : 'translate-x-0'
                };
            case 'lg':
                return {
                    container: 'w-16 h-8',
                    thumb: 'w-7 h-7',
                    translate: checked ? 'translate-x-8' : 'translate-x-0.5'
                };
            default: // md
                return {
                    container: 'w-12 h-6',
                    thumb: 'w-5 h-5',
                    translate: checked ? 'translate-x-6' : 'translate-x-0.5'
                };
        }
    };

    const sizeClasses = getSizeClasses();

    return (
        <div className={`flex items-center ${className}`}>
            {label && (
                <label
                    htmlFor={id}
                    className={`mr-3 text-sm font-medium ${disabled ? 'text-gray-400' : 'text-gray-700'
                        } cursor-pointer`}
                >
                    {label}
                </label>
            )}
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                id={id}
                name={name}
                disabled={disabled}
                onClick={handleToggle}
                className={`
                    ${sizeClasses.container}
                    relative inline-flex items-center rounded-full border-2 border-transparent
                    transition-colors duration-200 ease-in-out
                    ${checked
                        ? disabled
                            ? 'bg-primary/50'
                            : 'bg-primary hover:bg-primary-hover'
                        : disabled
                            ? 'bg-gray-200'
                            : 'bg-gray-300 hover:bg-gray-400'
                    }
                    ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}
                `}
            >
                <span
                    className={`
                        ${sizeClasses.thumb}
                        ${sizeClasses.translate}
                        pointer-events-none relative inline-block rounded-full bg-white shadow-lg
                        transform ring-0 transition duration-200 ease-in-out
                    `}
                />
            </button>
        </div>
    );
};

export default Switch;