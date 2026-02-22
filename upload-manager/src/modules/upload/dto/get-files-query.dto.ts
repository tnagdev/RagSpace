import { IsString, IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { UploadStatus, ProcessingStatus, ProcessingStage } from '@prisma/client';

export class GetFilesQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number = 20;

    @IsOptional()
    @IsEnum(UploadStatus)
    uploadStatus?: UploadStatus;

    @IsOptional()
    @IsEnum(ProcessingStatus)
    processingStatus?: ProcessingStatus;

    @IsOptional()
    @IsEnum(ProcessingStage)
    processingStage?: ProcessingStage;

    @IsOptional()
    @IsString()
    fileIds?: string;
}
