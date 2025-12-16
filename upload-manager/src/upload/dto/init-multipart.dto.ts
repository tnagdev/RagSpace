import { IsString, IsNumber, IsNotEmpty, Min } from 'class-validator';

export class InitMultipartUploadDto {
    @IsString()
    @IsNotEmpty()
    fileName: string;

    @IsNumber()
    @Min(1)
    fileSize: number;

    @IsString()
    @IsNotEmpty()
    mimeType: string;

    @IsNumber()
    @Min(5242880) // Minimum 5MB
    chunkSize?: number;
}
