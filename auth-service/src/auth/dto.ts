import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';
import { NoPlusAlias, PASSWORD_MESSAGE, PASSWORD_REGEX, SAME_ORIGIN_PATH } from './validators';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class SignUpDto {
    @Transform(trim)
    @IsString()
    @Length(1, 100)
    name!: string;

    @IsEmail()
    @MaxLength(254)
    @NoPlusAlias()
    email!: string;

    @IsString()
    @MinLength(8)
    @MaxLength(128)
    @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
    password!: string;
}

export class SignInDto {
    @IsEmail()
    @MaxLength(254)
    email!: string;

    @IsString()
    @MaxLength(128)
    password!: string;
}

export class ForgotPasswordDto {
    @IsEmail()
    @MaxLength(254)
    email!: string;
}

export class ResetPasswordDto {
    @IsString()
    @MaxLength(512)
    token!: string;

    @IsString()
    @MinLength(8)
    @MaxLength(128)
    @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
    newPassword!: string;
}

export class ChangePasswordDto {
    @IsString()
    @MaxLength(128)
    currentPassword!: string;

    @IsString()
    @MinLength(8)
    @MaxLength(128)
    @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
    newPassword!: string;

    @IsOptional()
    @IsBoolean()
    revokeOtherSessions?: boolean;
}

export class OAuthStartQueryDto {
    @IsOptional()
    @IsString()
    @MaxLength(512)
    @Matches(SAME_ORIGIN_PATH, { message: 'redirectTo must be a same-origin path' })
    redirectTo?: string;
}
