


export class UpdateFileDto {
    filename?: string;
    originalFilename?: string;
    fileSize?: number;
    processingStatus?: string;
    processingStage?: string;
    metadata?: Record<string, any>;
    errorMessage?: string;
    processingStartedAt?: Date;
    processingCompletedAt?: Date;
    updatedAt?: Date;
}