import { IsOptional, IsString, MaxLength } from 'class-validator';

export class GoogleLoginQueryDto {
    @IsOptional()
    @IsString()
    @MaxLength(500, { message: 'Callback URL must not exceed 500 characters' })
    callbackURL?: string;
}
