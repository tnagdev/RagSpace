import {
    IsOptional,
    IsString,
    IsNumber,
    IsDate,
    IsObject,
    IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProcessingStatus, ProcessingStage } from '@prisma/client';

export class UpdateFileDto {
    @IsOptional()
    @IsString()
    filename?: string;

    @IsOptional()
    @IsString()
    originalFilename?: string;

    @IsOptional()
    @IsNumber()
    fileSize?: number;

    @IsOptional()
    @IsEnum(ProcessingStatus)
    processingStatus?: ProcessingStatus;

    @IsOptional()
    @IsEnum(ProcessingStage)
    processingStage?: ProcessingStage;

    @IsOptional()
    @IsObject()
    metadata?: Record<string, any>;

    @IsOptional()
    @IsString()
    thumbnailPath?: string;

    @IsOptional()
    @IsString()
    errorMessage?: string;

    @IsOptional()
    @IsDate()
    @Type(() => Date)
    processingStartedAt?: Date;

    @IsOptional()
    @IsDate()
    @Type(() => Date)
    processingCompletedAt?: Date;

    @IsOptional()
    @IsNumber()
    processingRetryCount?: number;

    @IsOptional()
    @IsDate()
    @Type(() => Date)
    updatedAt?: Date;
}
