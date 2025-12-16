import { useField } from 'formik';
import { InputHTMLAttributes, ReactNode } from 'react';

interface FormInputProps extends InputHTMLAttributes<HTMLInputElement> {
    name: string;
    label?: string;
    helperText?: string;
    icon?: ReactNode;
}

export const FormInput = ({ label, helperText, icon, ...props }: FormInputProps) => {
    const [field, meta] = useField(props.name);
    const hasError = meta.touched && meta.error;

    return (
        <div className="w-full">
            {label && (
                <label
                    htmlFor={props.id || props.name}
                    className="block text-sm font-medium mb-2 text-text-secondary"
                >
                    {label}
                    {props.required && <span className="text-danger ml-1">*</span>}
                </label>
            )}

            <div className="relative">
                {icon && (
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-icon z-10">
                        {icon}
                    </div>
                )}
                <input
                    {...field}
                    {...props}
                    className={`
          w-full ${icon ? 'pl-11' : 'pl-3.5'} pr-3.5 py-3 text-sm
          transition-all duration-200 bg-bg-input backdrop-blur-sm text-text-primary placeholder:text-text-muted
          border outline-none rounded-[var(--radius-xl)]
          ${hasError
                            ? 'border-danger focus:border-danger'
                            : 'border-border-input focus:border-border-focus focus:ring-2 focus:ring-[var(--shadow-focus)]'
                        }
          ${props.disabled ? 'opacity-60 cursor-not-allowed' : ''}
        `}
                />
            </div>

            {hasError && (
                <p className="mt-1.5 text-xs text-danger font-medium">
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
