import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    S3Client,
    GetObjectCommand,
    DeleteObjectCommand,
    HeadObjectCommand,
    CreateMultipartUploadCommand,
    UploadPartCommand,
    CompleteMultipartUploadCommand,
    AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';

export interface UploadResult {
    key: string;
    bucket: string;
    url: string;
    size: number;
}

export interface MultipartUploadInitResult {
    uploadId: string;
    key: string;
    bucket: string;
    presignedUrls: string[];
}

export interface CompletedPart {
    ETag: string;
    PartNumber: number;
}

@Injectable()
export class S3Service {
    private readonly logger = new Logger(S3Service.name);
    private readonly s3Client: S3Client;
    /** Used only for getSignedUrl calls so presigned URLs contain the public hostname. */
    private readonly presignClient: S3Client;
    private readonly bucket: string;

    constructor(private configService: ConfigService) {
        const region = this.configService.get<string>('aws.region');
        const accessKeyId = this.configService.get<string>('aws.accessKeyId');
        const secretAccessKey = this.configService.get<string>(
            'aws.secretAccessKey',
        );
        const endpoint = this.configService.get<string>('aws.s3.endpoint');
        const publicEndpoint = this.configService.get<string>('aws.s3.publicEndpoint');

        this.bucket =
            this.configService.get<string>('aws.s3.bucket') || 'ragspace-uploads';

        const sharedClientConfig = {
            region,
            credentials:
                accessKeyId && secretAccessKey
                    ? { accessKeyId, secretAccessKey }
                    : undefined,
            // Only calculate checksums when strictly required.
            // SDK v3 defaults to WHEN_SUPPORTED which injects x-amz-checksum-crc32
            // into UploadPart presigned URLs; MinIO rejects those with 403.
            requestChecksumCalculation: 'WHEN_REQUIRED' as const,
            responseChecksumValidation: 'WHEN_REQUIRED' as const,
        };

        // Internal client — used for all server-side S3 operations (create/complete/abort).
        this.s3Client = new S3Client({
            ...sharedClientConfig,
            ...(endpoint && {
                endpoint,
                forcePathStyle: true,
                tls: endpoint.startsWith('https'),
            }),
        });

        // Presign client — uses the public endpoint so that generated URLs are
        // directly reachable by the browser. In production the public endpoint
        // equals the internal one (or is unset), so we fall back to s3Client config.
        const presignEndpoint = publicEndpoint || endpoint;
        this.presignClient = new S3Client({
            ...sharedClientConfig,
            ...(presignEndpoint && {
                endpoint: presignEndpoint,
                forcePathStyle: true,
                tls: presignEndpoint.startsWith('https'),
            }),
        });

        this.logger.log(`S3 Service initialized for bucket: ${this.bucket}`);
    }

    async uploadFile(
        file: Express.Multer.File,
        userId: string,
        onProgress?: (progress: number) => void,
    ): Promise<UploadResult> {
        try {
            const fileExtension = path.extname(file.originalname);
            const fileName = `${uuidv4()}${fileExtension}`;
            const key = `uploads/${userId}/${new Date().getFullYear()}/${new Date().getMonth() + 1}/${fileName}`;

            const upload = new Upload({
                client: this.s3Client,
                params: {
                    Bucket: this.bucket,
                    Key: key,
                    Body: file.buffer,
                    ContentType: file.mimetype,
                    Metadata: {
                        originalName: file.originalname,
                        userId,
                        uploadDate: new Date().toISOString(),
                    },
                },
            });

            if (onProgress) {
                upload.on('httpUploadProgress', (progress) => {
                    if (progress.loaded && progress.total) {
                        const percentage = Math.round(
                            (progress.loaded / progress.total) * 100,
                        );
                        onProgress(percentage);
                    }
                });
            }

            await upload.done();

            const url = await this.getSignedUrl(key);
            this.logger.log(`File uploaded successfully: ${key}`);

            return {
                key,
                bucket: this.bucket,
                url,
                size: file.size,
            };
        } catch (error) {
            this.logger.error('Error uploading file to S3', error);
            throw error;
        }
    }

    async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
        try {
            const command = new GetObjectCommand({
                Bucket: this.bucket,
                Key: key,
            });

            const url = await getSignedUrl(this.presignClient, command, { expiresIn });
            return url;
        } catch (error) {
            this.logger.error(`Error generating signed URL for key: ${key}`, error);
            throw error;
        }
    }

    async deleteFile(key: string): Promise<void> {
        try {
            const command = new DeleteObjectCommand({
                Bucket: this.bucket,
                Key: key,
            });

            await this.s3Client.send(command);
            this.logger.log(`File deleted successfully: ${key}`);
        } catch (error) {
            this.logger.error(`Error deleting file: ${key}`, error);
            throw error;
        }
    }

    async fileExists(key: string): Promise<boolean> {
        try {
            const command = new HeadObjectCommand({
                Bucket: this.bucket,
                Key: key,
            });

            await this.s3Client.send(command);
            return true;
        } catch (error) {
            if (
                error &&
                typeof error === 'object' &&
                'name' in error &&
                (error as { name: string }).name === 'NotFound'
            ) {
                return false;
            }
            throw error;
        }
    }

    async getFileMetadata(key: string) {
        try {
            const command = new HeadObjectCommand({
                Bucket: this.bucket,
                Key: key,
            });

            const response = await this.s3Client.send(command);
            return {
                contentType: response.ContentType,
                contentLength: response.ContentLength,
                lastModified: response.LastModified,
                metadata: response.Metadata,
            };
        } catch (error) {
            this.logger.error(`Error getting file metadata: ${key}`, error);
            throw error;
        }
    }


    async initMultipartUpload(
        fileName: string,
        fileSize: number,
        mimeType: string,
        userId: string,
        chunkSize: number = 5 * 1024 * 1024,
    ): Promise<MultipartUploadInitResult> {
        try {
            const fileExtension = path.extname(fileName);
            const generatedFileName = `${uuidv4()}${fileExtension}`;
            const key = `uploads/${userId}/${new Date().getFullYear()}/${new Date().getMonth() + 1}/${generatedFileName}`;

            const createCommand = new CreateMultipartUploadCommand({
                Bucket: this.bucket,
                Key: key,
                ContentType: mimeType,
                Metadata: {
                    originalName: fileName,
                    userId,
                    uploadDate: new Date().toISOString(),
                },
            });

            const { UploadId } = await this.s3Client.send(createCommand);

            if (!UploadId) {
                throw new Error('Failed to initialize multipart upload');
            }

            const numParts = Math.ceil(fileSize / chunkSize);

            const presignedUrls: string[] = [];
            for (let partNumber = 1; partNumber <= numParts; partNumber++) {
                const uploadPartCommand = new UploadPartCommand({
                    Bucket: this.bucket,
                    Key: key,
                    UploadId,
                    PartNumber: partNumber,
                });

                const presignedUrl = await getSignedUrl(
                    this.presignClient,
                    uploadPartCommand,
                    { expiresIn: 3600 },
                );
                presignedUrls.push(presignedUrl);
            }

            this.logger.log(
                `Multipart upload initialized: ${UploadId}, ${numParts} parts`,
            );

            return {
                uploadId: UploadId,
                key,
                bucket: this.bucket,
                presignedUrls,
            };
        } catch (error) {
            this.logger.error('Error initializing multipart upload', error);
            throw error;
        }
    }


    async completeMultipartUpload(
        key: string,
        uploadId: string,
        parts: CompletedPart[],
    ): Promise<UploadResult> {
        try {
            const completeCommand = new CompleteMultipartUploadCommand({
                Bucket: this.bucket,
                Key: key,
                UploadId: uploadId,
                MultipartUpload: {
                    Parts: parts.map((part) => ({
                        ETag: part.ETag,
                        PartNumber: part.PartNumber,
                    })),
                },
            });

            await this.s3Client.send(completeCommand);

            const url = await this.getSignedUrl(key);

            this.logger.log(`Multipart upload completed: ${key}`);

            const size = parts.length * 5 * 1024 * 1024;

            return {
                key,
                bucket: this.bucket,
                url,
                size,
            };
        } catch (error) {
            this.logger.error('Error completing multipart upload', error);
            throw error;
        }
    }

    async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
        try {
            const abortCommand = new AbortMultipartUploadCommand({
                Bucket: this.bucket,
                Key: key,
                UploadId: uploadId,
            });

            await this.s3Client.send(abortCommand);
            this.logger.log(`Multipart upload aborted: ${uploadId}`);
        } catch (error) {
            if (error.name === 'NoSuchUpload' || error.Code === 'S3Error') {
                this.logger.warn(`Multipart upload ${uploadId} does not exist (may have been completed or aborted already)`);
                return;
            }
            this.logger.error('Error aborting multipart upload', error);
            throw error;
        }
    }
}
