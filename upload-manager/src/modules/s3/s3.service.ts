import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    AbortMultipartUploadCommand,
    CompleteMultipartUploadCommand,
    CreateMultipartUploadCommand,
    DeleteObjectCommand,
    GetObjectCommand,
    S3Client,
    UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import * as path from 'path';

export const PRESIGN_EXPIRES_SECONDS = 3600;
const S3_TIMEOUT_MS = 30_000;

export interface CompletedPart {
    ETag: string;
    PartNumber: number;
}

@Injectable()
export class S3Service {
    private readonly logger = new Logger(S3Service.name);
    private readonly s3Client: S3Client;
    // Signs browser-facing URLs with the public hostname; s3Client uses the in-network one.
    private readonly presignClient: S3Client;
    readonly bucket: string;

    constructor(configService: ConfigService) {
        const accessKeyId = configService.get<string>('aws.accessKeyId');
        const secretAccessKey = configService.get<string>('aws.secretAccessKey');
        const endpoint = configService.get<string>('aws.s3.endpoint');
        const publicEndpoint = configService.get<string>('aws.s3.publicEndpoint') || endpoint;
        this.bucket = configService.get<string>('aws.s3.bucket') || 'ragspace-uploads';

        const shared = {
            region: configService.get<string>('aws.region'),
            credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
            // The SDK's default checksum headers on presigned UploadPart URLs are rejected by MinIO.
            requestChecksumCalculation: 'WHEN_REQUIRED' as const,
            responseChecksumValidation: 'WHEN_REQUIRED' as const,
            requestHandler: { requestTimeout: S3_TIMEOUT_MS, connectionTimeout: 5_000 },
        };
        const endpointConfig = (url?: string) =>
            url ? { endpoint: url, forcePathStyle: true, tls: url.startsWith('https') } : {};

        this.s3Client = new S3Client({ ...shared, ...endpointConfig(endpoint) });
        this.presignClient = new S3Client({ ...shared, ...endpointConfig(publicEndpoint) });
    }

    objectKey(userId: string, fileName: string): string {
        const now = new Date();
        return `uploads/${userId}/${now.getFullYear()}/${now.getMonth() + 1}/${randomUUID()}${path.extname(fileName)}`;
    }

    getSignedUrl(key: string, expiresIn = PRESIGN_EXPIRES_SECONDS): Promise<string> {
        return getSignedUrl(this.presignClient, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn });
    }

    getInternalSignedUrl(key: string, expiresIn = 300): Promise<string> {
        return getSignedUrl(this.s3Client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn });
    }

    async deleteObject(key: string): Promise<void> {
        try {
            await this.s3Client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
        } catch (error) {
            this.logger.warn(`Failed to delete s3://${this.bucket}/${key}: ${(error as Error).message}`);
        }
    }

    async createMultipartUpload(key: string, mimeType: string, metadata: Record<string, string>): Promise<string> {
        const { UploadId } = await this.s3Client.send(
            new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key, ContentType: mimeType, Metadata: metadata }),
        );
        if (!UploadId) throw new Error('S3 did not return an UploadId');
        return UploadId;
    }

    presignParts(key: string, uploadId: string, partCount: number): Promise<string[]> {
        return Promise.all(
            Array.from({ length: partCount }, (_, index) =>
                getSignedUrl(
                    this.presignClient,
                    new UploadPartCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId, PartNumber: index + 1 }),
                    { expiresIn: PRESIGN_EXPIRES_SECONDS },
                ),
            ),
        );
    }

    async completeMultipartUpload(key: string, uploadId: string, parts: CompletedPart[]): Promise<void> {
        await this.s3Client.send(
            new CompleteMultipartUploadCommand({
                Bucket: this.bucket,
                Key: key,
                UploadId: uploadId,
                MultipartUpload: { Parts: [...parts].sort((a, b) => a.PartNumber - b.PartNumber) },
            }),
        );
    }

    async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
        try {
            await this.s3Client.send(new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId }));
        } catch (error) {
            this.logger.warn(`Abort of multipart upload ${uploadId} failed: ${(error as Error).message}`);
        }
    }
}
