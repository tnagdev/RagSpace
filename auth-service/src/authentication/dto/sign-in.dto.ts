import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { NoPlusAlias } from '../validators/email.validator';

export class SignInDto {
    @IsString()
    @IsNotEmpty({ message: 'Email is required' })
    @IsEmail({}, { message: 'Invalid email address' })
    @NoPlusAlias()
    email!: string;

    @IsString()
    @IsNotEmpty({ message: 'Password is required' })
    password!: string;
}
