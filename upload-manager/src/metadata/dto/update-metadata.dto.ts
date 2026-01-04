import { IsString, IsOptional, IsArray, IsObject } from 'class-validator';

export class UpdateFileMetadataDto {
    @IsString()
    @IsOptional()
    summary?: string;

    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    objects?: string[];

    @IsString()
    @IsOptional()
    setting?: string;

    @IsString()
    @IsOptional()
    style?: string;

    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    colors?: string[];

    @IsObject()
    @IsOptional()
    rawResponse?: Record<string, any>;
}
