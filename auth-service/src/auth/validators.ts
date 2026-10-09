import { ValidateBy, ValidationOptions } from 'class-validator';

export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).+$/;
export const PASSWORD_MESSAGE =
    'Password must contain an uppercase letter, a lowercase letter, a number and a special character';
export const SAME_ORIGIN_PATH = /^\/(?![/\\])/;

export function NoPlusAlias(validationOptions?: ValidationOptions) {
    return ValidateBy(
        {
            name: 'noPlusAlias',
            validator: {
                validate: (value: string) => !value || !value.split('@')[0].includes('+'),
                defaultMessage: () => 'Email aliases using "+" are not allowed',
            },
        },
        validationOptions,
    );
}
