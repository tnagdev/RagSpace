import { useField } from 'formik';
import { TextareaHTMLAttributes } from 'react';

interface FormTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    name: string;
    label?: string;
    helperText?: string;
}

export const FormTextarea = ({ label, helperText, ...props }: FormTextareaProps) => {
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

            <textarea
                {...field}
                {...props}
                className={`
          w-full px-3.5 py-2.5 rounded-lg text-sm min-h-[100px]
          transition-all duration-200 resize-vertical bg-bg-primary text-text-primary
          ${hasError
                        ? 'border-2 border-red-500 focus:border-red-500'
                        : 'border border-border focus:border-accent-primary'
                    }
          ${props.disabled ? 'opacity-60 cursor-not-allowed' : ''}
        `}
            />

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
