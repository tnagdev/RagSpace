import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    S3Client,
    GetObjectCommand,
    DeleteObjectCommand,
    HeadObjectCommand,
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

@Injectable()
export class S3Service {
    private readonly logger = new Logger(S3Service.name);
    private readonly s3Client: S3Client;
    private readonly bucket: string;

    constructor(private configService: ConfigService) {
        const region = this.configService.get<string>('aws.region');
        const accessKeyId = this.configService.get<string>('aws.accessKeyId');
        const secretAccessKey = this.configService.get<string>(
            'aws.secretAccessKey',
        );
        const endpoint = this.configService.get<string>('aws.s3.endpoint');

        this.bucket =
            this.configService.get<string>('aws.s3.bucket') || 'ragspace-uploads';

        this.s3Client = new S3Client({
            region,
            credentials:
                accessKeyId && secretAccessKey
                    ? {
                        accessKeyId,
                        secretAccessKey,
                    }
                    : undefined,
            ...(endpoint && {
                endpoint,
                forcePathStyle: true,
                tls: true,
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

            const url = await getSignedUrl(this.s3Client, command, { expiresIn });
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
}
