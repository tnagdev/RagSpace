import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthenticationService {
    protected readonly logger = new Logger(AuthenticationService.name);
    private readonly paymentServiceUrl: string;
    private readonly uploadManagerUrl: string;
    private readonly fileEmbedderUrl: string;
    private readonly sceneDetectorUrl: string;

    constructor(
        private prisma: PrismaService,
        private configService: ConfigService,
    ) {
        this.paymentServiceUrl = this.configService.get('PAYMENT_SERVICE_URL', 'http://localhost:8006');
        this.uploadManagerUrl = this.configService.get('UPLOAD_MANAGER_URL', 'http://localhost:8002');
        this.fileEmbedderUrl = this.configService.get('FILE_EMBEDDER_URL', 'http://localhost:8004');
        this.sceneDetectorUrl = this.configService.get('SCENE_DETECTOR_URL', 'http://localhost:8003');
    }

    async findUserByUsername(username: string) {
        return this.prisma.user.findFirst({
            where: { username }
        });
    }

    async findUserByEmail(email: string) {
        return this.prisma.user.findFirst({
            where: { email }
        });
    }

    async findUserById(id: string) {
        return this.prisma.user.findUnique({
            where: { id },
            select: { id: true, email: true, name: true, image: true, emailVerified: true, createdAt: true, updatedAt: true },
        });
    }

    async updateUserUsername(userId: string, username: string) {
        return this.prisma.user.update({
            where: { id: userId },
            data: { username }
        });
    }

    async createFreeSubscription(userId: string): Promise<void> {
        try {
            const response = await fetch(`${this.paymentServiceUrl}/subscriptions/free`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ userId }),
            });

            if (!response.ok) {
                const error = await response.text();
                this.logger.error(`Failed to create free subscription: ${error}`);
                throw new Error(`Failed to create free subscription: ${response.status}`);
            }

            this.logger.log(`Created free subscription for user ${userId}`);
        } catch (error) {
            this.logger.error('Error creating free subscription:', error);
            // Don't throw - subscription can be created later
        }
    }

    async deleteUserAccount(userId: string, userObj: any): Promise<void> {
        const userHeader = JSON.stringify(userObj);
        const serviceHeader = 'auth-service';

        // Delete uploads + S3 files
        try {
            await fetch(`${this.uploadManagerUrl}/upload/user-data`, {
                method: 'DELETE',
                headers: { 'x-user': userHeader, 'x-service': serviceHeader },
            });
            this.logger.log(`Deleted upload data for user ${userId}`);
        } catch (error) {
            this.logger.error(`Failed to delete uploads for user ${userId}: ${error.message}`);
        }

        // Delete ChromaDB embeddings
        try {
            await fetch(`${this.fileEmbedderUrl}/embed/user/${userId}`, {
                method: 'DELETE',
                headers: { 'x-user': userHeader, 'x-service': serviceHeader },
            });
            this.logger.log(`Deleted embeddings for user ${userId}`);
        } catch (error) {
            this.logger.error(`Failed to delete embeddings for user ${userId}: ${error.message}`);
        }

        // Delete scenes + thumbnails
        try {
            await fetch(`${this.sceneDetectorUrl}/scenes/user/${userId}`, {
                method: 'DELETE',
                headers: { 'x-user': userHeader, 'x-service': serviceHeader },
            });
            this.logger.log(`Deleted scenes for user ${userId}`);
        } catch (error) {
            this.logger.error(`Failed to delete scenes for user ${userId}: ${error.message}`);
        }

        // Delete user from auth DB (cascades sessions + accounts)
        const result = await this.prisma.user.deleteMany({ where: { id: userId } });
        this.logger.log(`Deleted auth user ${userId} (${result.count} record removed)`);
    }
}
