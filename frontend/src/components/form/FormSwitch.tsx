import { useField } from 'formik';
import { InputHTMLAttributes } from 'react';

interface FormSwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
    name: string;
    label: string;
    helperText?: string;
}

export const FormSwitch = ({ label, helperText, ...props }: FormSwitchProps) => {
    const [field, meta] = useField({ ...props, type: 'checkbox' });
    const hasError = meta.touched && meta.error;

    return (
        <div className="w-full">
            <label className="flex items-start gap-3 cursor-pointer group">
                <div className="relative flex items-center justify-center mt-0.5">
                    <input
                        {...field}
                        {...props}
                        type="checkbox"
                        className="sr-only"
                    />
                    <div
                        className={`
              w-11 h-6 rounded-full transition-all duration-200
              ${field.checked
                                ? 'bg-accent-primary'
                                : 'bg-bg-tertiary'
                            }
              ${props.disabled ? 'opacity-60 cursor-not-allowed' : ''}
            `}
                    >
                        <div
                            className={`
                w-5 h-5 bg-white rounded-full shadow-md
                transition-transform duration-200
                ${field.checked ? 'translate-x-[22px]' : 'translate-x-[2px]'}
                mt-[2px]
              `}
                        />
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
                <p className="mt-1.5 text-xs text-red-500 font-medium ml-14">
                    {meta.error}
                </p>
            )}
        </div>
    );
};
