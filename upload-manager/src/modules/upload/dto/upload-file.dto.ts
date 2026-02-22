import { IsString, IsNotEmpty } from 'class-validator';

export class UploadFileDto {
    @IsString()
    @IsNotEmpty()
    userId: string;
}

export class FileMetadataDto {
    originalFilename: string;
    fileSize: number;
    mimeType: string;
}
