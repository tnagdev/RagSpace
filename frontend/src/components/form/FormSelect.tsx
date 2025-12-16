import { useField } from 'formik';
import { SelectHTMLAttributes } from 'react';
import { IoChevronDown } from 'react-icons/io5';

interface FormSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
    name: string;
    label?: string;
    helperText?: string;
    options: Array<{ value: string | number; label: string }>;
    placeholder?: string;
}

export const FormSelect = ({
    label,
    helperText,
    options,
    placeholder = 'Select an option',
    ...props
}: FormSelectProps) => {
    const [field, meta] = useField(props.name);
    const hasError = meta.touched && meta.error;

    return (
        <div className="w-full">
            {label && (
                <label
                    htmlFor={props.id || props.name}
                    className="block text-sm font-medium mb-1.5 text-text-secondary"
                >
                    {label}
                    {props.required && <span className="text-red-500 ml-1">*</span>}
                </label>
            )}

            <div className="relative">
                <select
                    {...field}
                    {...props}
                    className={`
            w-full px-3.5 py-2.5 rounded-lg text-sm appearance-none
            transition-all duration-200 cursor-pointer pr-10 bg-bg-primary text-text-primary
            ${hasError
                            ? 'border-2 border-red-500 focus:border-red-500'
                            : 'border border-border focus:border-accent-primary'
                        }
            ${props.disabled ? 'opacity-60 cursor-not-allowed' : ''}
          `}
                >
                    <option value="" disabled>
                        {placeholder}
                    </option>
                    {options.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>

                <IoChevronDown
                    className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted"
                    size={18}
                />
            </div>

            {hasError && (
                <p className="mt-1.5 text-xs text-red-500 font-medium">
                    {meta.error}
                </p>
            )}

            {helperText && !hasError && (
                <p className="mt-1.5 text-xs text-text-muted">
                    {helperText}
                </p>
            )}
        </div>
    );
};
