import { IsString, IsOptional, IsArray, IsEnum, IsObject } from 'class-validator';
import { MetadataSourceType } from '@prisma/client';

export class CreateFileMetadataDto {
    @IsString()
    fileId: string;

    @IsString()
    @IsOptional()
    sceneId?: string;

    @IsEnum(MetadataSourceType)
    sourceType: MetadataSourceType;

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
