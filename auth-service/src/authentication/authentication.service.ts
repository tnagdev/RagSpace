import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from './types/user.type';
import { RabbitmqService, UserEventType } from 'src/common/services/rabbitmq.service';

@Injectable()
export class AuthenticationService {
    protected readonly logger = new Logger(AuthenticationService.name);

    constructor(
        private prisma: PrismaService,
        private rabbitmqService: RabbitmqService,
    ) { }

    async findUserByEmail(email: string): Promise<AuthUser | null> {
        const user = await this.prisma.user.findUnique({
            where: { email },
            select: { id: true, email: true, name: true, image: true, emailVerified: true, createdAt: true, updatedAt: true },
        });
        return user ? { ...user, createdAt: user.createdAt.toISOString(), updatedAt: user.updatedAt.toISOString() } : null;
    }

    async findUserById(id: string): Promise<AuthUser | null> {
        const user = await this.prisma.user.findUnique({
            where: { id },
            select: { id: true, email: true, name: true, image: true, emailVerified: true, createdAt: true, updatedAt: true },
        });
        return user ? { ...user, createdAt: user.createdAt.toISOString(), updatedAt: user.updatedAt.toISOString() } : null;
    }


    async deleteUserAccount(userId: string, userObj: AuthUser): Promise<void> {
        const result = await this.prisma.user.deleteMany({ where: { id: userId } });
        if (result.count === 0) {
            this.logger.warn(`No user found with ID ${userId} to delete`);
            return;
        }

        await this.rabbitmqService.publishEvent({
            type: UserEventType.USER_DELETED,
            user: userObj,
            timestamp: new Date(),
        });

        // // Delete uploads + S3 files
        // try {
        //     await fetch(`${this.uploadManagerUrl}/upload/user-data`, {
        //         method: 'DELETE',
        //         headers: { 'x-user': userHeader, 'x-service': serviceHeader },
        //     });
        //     this.logger.log(`Deleted upload data for user ${userId}`);
        // } catch (error) {
        //     this.logger.error(`Failed to delete uploads for user ${userId}: ${error.message}`);
        // }

        // // Delete ChromaDB embeddings
        // try {
        //     await fetch(`${this.fileEmbedderUrl}/embed/user/${userId}`, {
        //         method: 'DELETE',
        //         headers: { 'x-user': userHeader, 'x-service': serviceHeader },
        //     });
        //     this.logger.log(`Deleted embeddings for user ${userId}`);
        // } catch (error) {
        //     this.logger.error(`Failed to delete embeddings for user ${userId}: ${error.message}`);
        // }

        // // Delete scenes + thumbnails
        // try {
        //     await fetch(`${this.sceneDetectorUrl}/scenes/user/${userId}`, {
        //         method: 'DELETE',
        //         headers: { 'x-user': userHeader, 'x-service': serviceHeader },
        //     });
        //     this.logger.log(`Deleted scenes for user ${userId}`);
        // } catch (error) {
        //     this.logger.error(`Failed to delete scenes for user ${userId}: ${error.message}`);
        // }

        // Delete user from auth DB (cascades sessions + accounts)
        this.logger.log(`Deleted auth user ${userId} (${result.count} record removed)`);
    }
}
