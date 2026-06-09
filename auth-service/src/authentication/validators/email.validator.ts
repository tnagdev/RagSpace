import {
    ValidateBy,
    ValidationOptions,
} from 'class-validator';

export function NoPlusAlias(validationOptions?: ValidationOptions) {
    return ValidateBy(
        {
            name: 'noPlusAlias',
            validator: {
                validate(value: string) {
                    if (!value) return true;

                    const [localPart] = value.split('@');
                    return !localPart.includes('+');
                },
                defaultMessage() {
                    return 'Email aliases using "+" are not allowed';
                },
            },
        },
        validationOptions,
    );
}