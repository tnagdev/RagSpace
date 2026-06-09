import { IsString, MinLength, IsNotEmpty, Matches } from 'class-validator';
import { PASSWORD_REGEX } from '../validators/regex';

export class ResetPasswordDto {
    @IsString()
    @IsNotEmpty({ message: 'Token is required' })
    token!: string;

    @IsString()
    @IsNotEmpty({ message: 'Password is required' })
    @MinLength(8, { message: 'Password must be at least 8 characters long' })
    @Matches(PASSWORD_REGEX, {
        message:
            'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
    })
    newPassword!: string;
}
