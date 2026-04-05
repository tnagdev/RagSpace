import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';

export class UpdateProfileDto {
    @IsOptional()
    @IsString()
    @MinLength(2)
    @MaxLength(60)
    name?: string;

    @IsOptional()
    @IsString()
    @MinLength(3)
    @MaxLength(30)
    username?: string;
}
