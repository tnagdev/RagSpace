import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface DropdownOption {
    value: string | number;
    label: string;
}

interface DropdownProps {
    value?: string | number;
    defaultValue?: string | number;
    onChange?: (value: string | number) => void;
    options: DropdownOption[];
    placeholder?: string;
    className?: string;
    disabled?: boolean;
}

const Dropdown = ({
    value,
    defaultValue,
    onChange,
    options,
    placeholder = 'Select...',
    className = '',
    disabled = false,
}: DropdownProps) => {
    const [internalValue, setInternalValue] = useState<string | number | undefined>(
        defaultValue
    );
    const [isOpen, setIsOpen] = useState(false);
    const [isPositioned, setIsPositioned] = useState(false);
    const [position, setPosition] = useState<'top' | 'bottom'>('bottom');
    const [alignment, setAlignment] = useState<'left' | 'right'>('left');
    const dropdownRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const currentValue = value !== undefined ? value : internalValue;
    const selectedOption = options.find((opt) => opt.value === currentValue);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && dropdownRef.current && menuRef.current) {
            // Wait for next frame to ensure menu is rendered
            requestAnimationFrame(() => {
                if (!menuRef.current || !dropdownRef.current) return;

                const buttonRect = dropdownRef.current.getBoundingClientRect();
                const menuRect = menuRef.current.getBoundingClientRect();
                const viewportHeight = window.innerHeight;
                const viewportWidth = window.innerWidth;

                // Calculate space available above and below
                const spaceBelow = viewportHeight - buttonRect.bottom;
                const spaceAbove = buttonRect.top;

                // Determine vertical position
                const menuHeight = menuRect.height || 240;
                if (spaceBelow < menuHeight && spaceAbove > spaceBelow) {
                    setPosition('top');
                } else {
                    setPosition('bottom');
                }

                // Determine horizontal alignment
                const spaceRight = viewportWidth - buttonRect.left;
                const menuWidth = menuRect.width || 200;
                if (spaceRight < menuWidth) {
                    setAlignment('right');
                } else {
                    setAlignment('left');
                }

                setIsPositioned(true);
            });
        } else {
            setIsPositioned(false);
        }
    }, [isOpen]);

    const handleSelect = (optionValue: string | number) => {
        if (disabled) return;

        if (value === undefined) {
            setInternalValue(optionValue);
        }

        onChange?.(optionValue);
        setIsOpen(false);
    };

    const handleToggle = () => {
        if (!disabled) {
            setIsOpen(!isOpen);
        }
    };

    return (
        <div ref={dropdownRef} className={`relative inline-block ${className}`}>
            <button
                type="button"
                onClick={handleToggle}
                disabled={disabled}
                className={`
                    flex items-center justify-between gap-2 px-3 py-1.5 
                    bg-surface-primary border border-divider rounded-md 
                    text-text-primary text-sm font-medium
                    transition-all duration-200
                    hover:border-accent-primary hover:bg-surface-secondary
                    focus:outline-none focus:ring-2 focus:ring-accent-primary
                    ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                    ${isOpen ? 'border-accent-primary ring-2 ring-accent-primary' : ''}
                `}
            >
                <span>{selectedOption ? selectedOption.label : placeholder}</span>
                <ChevronDown
                    className={`w-4 h-4 text-text-muted transition-transform duration-200 ${isOpen ? 'rotate-180' : ''
                        }`}
                />
            </button>

            {isOpen && (
                <div
                    ref={menuRef}
                    className={`
                        absolute min-w-full
                        border border-divider rounded-md shadow-2xl
                        z-50 overflow-hidden
                        transition-opacity duration-100
                        ${position === 'bottom' ? 'top-full mt-1' : 'bottom-full mb-1'}
                        ${alignment === 'left' ? 'left-0' : 'right-0'}
                        ${isPositioned ? 'opacity-100' : 'opacity-0'}
                    `}
                    style={{
                        backdropFilter: 'blur(12px)',
                        backgroundColor: 'var(--color-bg-tertiary)',
                    }}
                >
                    <div className="py-1 max-h-60 overflow-y-auto custom-scrollbar">
                        {options.map((option) => {
                            const isSelected = option.value === currentValue;
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => handleSelect(option.value)}
                                    className={`
                                        w-full flex items-center justify-between gap-2 px-3 py-2
                                        text-sm text-left transition-all duration-150
                                        ${isSelected
                                            ? 'bg-accent-primary text-white font-semibold shadow-sm'
                                            : 'text-text-primary hover:text-text-primary'
                                        }
                                    `}
                                    style={{
                                        backgroundColor: isSelected ? undefined : 'transparent',
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!isSelected) {
                                            e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!isSelected) {
                                            e.currentTarget.style.backgroundColor = 'transparent';
                                        }
                                    }}
                                >
                                    <span>{option.label}</span>
                                    {isSelected && <Check className="w-4 h-4 shrink-0" />}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dropdown;
