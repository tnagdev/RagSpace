import { IsEmail, IsString, Length, Matches, IsNotEmpty, MinLength } from "class-validator";
import { Transform } from "class-transformer";
import { NoPlusAlias } from "../validators/email.validator";
import { NAME_REGEX, PASSWORD_REGEX } from "../validators/regex";

export class SignUpDto {
    @IsNotEmpty({ message: 'Email is required' })
    @IsEmail({}, { message: 'Invalid email address' })
    @NoPlusAlias()
    email!: string;

    @IsString()
    @IsNotEmpty({ message: 'Password is required' })
    @MinLength(8, { message: 'Password must be at least 8 characters long' })
    @Matches(PASSWORD_REGEX, {
        message:
            'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
    })
    password!: string;

    @Transform(({ value }) => value?.trim())
    @IsString()
    @IsNotEmpty({ message: 'First name is required' })
    @Length(2, 50, { message: 'First name must be between 2 and 50 characters long' })
    @Matches(NAME_REGEX, {
        message:
            'First name may only contain letters, spaces, apostrophes, and hyphens',
    })
    firstName!: string;

    @IsString()
    @IsNotEmpty({ message: 'Last name is required' })
    @Length(2, 50, { message: 'Last name must be between 2 and 50 characters long' })
    @Matches(NAME_REGEX, {
        message:
            'Last name may only contain letters, spaces, apostrophes, and hyphens',
    })
    lastName!: string;
}
