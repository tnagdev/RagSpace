import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthenticationService {
    protected readonly logger = new Logger(AuthenticationService.name);
    private readonly paymentServiceUrl: string;

    constructor(
        private prisma: PrismaService,
        private configService: ConfigService,
    ) {
        this.paymentServiceUrl = this.configService.get('PAYMENT_SERVICE_URL', 'http://localhost:8006');
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
}
