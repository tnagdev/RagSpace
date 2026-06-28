import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseHttpClient, PaymentEndpoints } from '@ragspace/shared-ts';
import type { AuthUser } from '@ragspace/shared-ts';


@Injectable()
export class PaymentService extends BaseHttpClient {
    private readonly paymentServiceUrl: string;

    constructor(
        http: HttpService,
        configService: ConfigService,
    ) {
        super(http, 'auth-service');
        this.paymentServiceUrl = configService.get('PAYMENT_SERVICE_URL', 'http://localhost:8006');
    }

    async createFreeSubscription(user: AuthUser): Promise<void> {
        try {
            await this.post<void>(
                user,
                `${this.paymentServiceUrl}${PaymentEndpoints.CREATE_FREE_SUBSCRIPTION}`,
                { userId: user.id },
            );
            this.logger.log(`Created free subscription for user ${user.id}`);
        } catch (error) {
            this.logger.error(`Failed to create free subscription for user ${user.id}:`, error);
            throw error;
        }
    }

    async getSubscriptionStatus(user: AuthUser): Promise<{ status: string; expiresAt?: string }> {
        try {
            return await this.get<{ status: string; expiresAt?: string }>(
                user,
                `${this.paymentServiceUrl}${PaymentEndpoints.GET_SUBSCRIPTION_STATUS}`,
            );
        } catch (error) {
            this.logger.error(`Failed to get subscription status for user ${user.id}:`, error);
            throw error;
        }
    }
}
