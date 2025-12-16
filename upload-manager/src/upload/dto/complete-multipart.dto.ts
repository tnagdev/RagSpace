import { IsString, IsArray, IsNotEmpty, ValidateNested, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CompletedPartDto {
    @IsString()
    @IsNotEmpty()
    ETag: string;

    @IsNumber()
    PartNumber: number;
}

export class CompleteMultipartUploadDto {
    @IsString()
    @IsNotEmpty()
    fileId: string;

    @IsString()
    @IsNotEmpty()
    key: string;

    @IsString()
    @IsNotEmpty()
    uploadId: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CompletedPartDto)
    parts: CompletedPartDto[];

    @IsNumber()
    @Min(1)
    totalSize: number;
}
