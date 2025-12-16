import { useField } from 'formik';
import { InputHTMLAttributes } from 'react';

interface RadioOption {
    value: string | number;
    label: string;
    helperText?: string;
}

interface FormRadioGroupProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
    name: string;
    label?: string;
    options: RadioOption[];
    direction?: 'vertical' | 'horizontal';
}

export const FormRadioGroup = ({
    label,
    options,
    direction = 'vertical',
    ...props
}: FormRadioGroupProps) => {
    const [field, meta] = useField(props.name);
    const hasError = meta.touched && meta.error;

    return (
        <div className="w-full">
            {label && (
                <label className="block text-sm font-medium mb-2 text-text-secondary">
                    {label}
                    {props.required && <span className="text-red-500 ml-1">*</span>}
                </label>
            )}

            <div className={`flex ${direction === 'vertical' ? 'flex-col gap-3' : 'flex-row gap-6'}`}>
                {options.map((option) => (
                    <label
                        key={option.value}
                        className="flex items-start gap-3 cursor-pointer group"
                    >
                        <div className="relative flex items-center justify-center mt-0.5">
                            <input
                                {...field}
                                {...props}
                                type="radio"
                                value={option.value}
                                checked={field.value === option.value}
                                className="sr-only"
                                disabled={props.disabled}
                            />
                            <div
                                className={`
                  w-5 h-5 rounded-full border-2 flex items-center justify-center bg-bg-primary
                  transition-all duration-200
                  ${field.value === option.value
                                        ? 'border-accent-primary'
                                        : 'border-border'
                                    }
                  ${hasError ? 'border-red-500' : ''}
                  ${props.disabled ? 'opacity-60 cursor-not-allowed' : 'group-hover:border-accent-primary'}
                `}
                            >
                                {field.value === option.value && (
                                    <div className="w-2.5 h-2.5 rounded-full bg-accent-primary" />
                                )}
                            </div>
                        </div>

                        <div className="flex-1">
                            <span className="text-sm font-medium text-text-primary">
                                {option.label}
                            </span>
                            {option.helperText && (
                                <p className="mt-0.5 text-xs text-text-muted">
                                    {option.helperText}
                                </p>
                            )}
                        </div>
                    </label>
                ))}
            </div>

            {hasError && (
                <p className="mt-2 text-xs text-red-500 font-medium">
                    {meta.error}
                </p>
            )}
        </div>
    );
};
