import { useField } from 'formik';
import React, { InputHTMLAttributes } from 'react';
import { IoCheckmark } from 'react-icons/io5';

interface FormCheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
    name: string;
    label: React.ReactNode;
    helperText?: string;
}

export const FormCheckbox = ({ label, helperText, ...props }: FormCheckboxProps) => {
    const [field, meta] = useField({ ...props, type: 'checkbox' });
    const hasError = meta.touched && meta.error;

    return (
        <div className="w-full">
            <label className="flex items-center gap-3 cursor-pointer group">
                <div className="relative flex items-center justify-center mt-0.5">
                    <input
                        {...field}
                        {...props}
                        type="checkbox"
                        className="sr-only"
                    />
                    <div
                        className={`
              w-[18px] h-[18px] rounded border-2 flex items-center justify-center
              transition-all duration-200
              ${field.checked
                                ? 'bg-accent-primary border-accent-primary'
                                : 'border-border-input bg-transparent'
                            }
              ${hasError ? 'border-danger' : ''}
              ${props.disabled ? 'opacity-60 cursor-not-allowed' : 'group-hover:border-accent-primary'}
            `}
                    >
                        {field.checked && <IoCheckmark className="text-text-inverse" size={14} />}
                    </div>
                </div>

                <div className="flex-1">
                    <span className="text-sm font-medium text-text-primary">
                        {label}
                    </span>
                    {helperText && !hasError && (
                        <p className="mt-0.5 text-xs text-text-muted">
                            {helperText}
                        </p>
                    )}
                </div>
            </label>

            {hasError && (
                <p className="mt-1.5 text-xs text-red-500 font-medium ml-8">
                    {meta.error}
                </p>
            )}
        </div>
    );
};
