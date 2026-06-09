import { HttpService } from '@nestjs/axios';
import { BaseHttpClient } from './http.service';
import { ConfigService } from '@nestjs/config';
import { AuthUser } from 'src/authentication/types/user.type';
import { PaymentEndpoints } from '../endpoints/payment.endpoint';
import { Injectable } from '@nestjs/common';


@Injectable()
export class PaymentService extends BaseHttpClient {
    private readonly paymentServiceUrl: string;

    constructor(
        http: HttpService,
        configService: ConfigService,
    ) {
        super(http);
        this.paymentServiceUrl = configService.get('PAYMENT_SERVICE_URL', 'http://localhost:8006');
    }

    async createFreeSubscription(user: AuthUser): Promise<void> {
        try {
            const response = await this.post<void>(
                user,
                `${this.paymentServiceUrl}${PaymentEndpoints.CREATE_FREE_SUBSCRIPTION}`,
                { userId: user.id }
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
                `${this.paymentServiceUrl}${PaymentEndpoints.GET_SUBSCRIPTION_STATUS}`
            );
        } catch (error) {
            this.logger.error(`Failed to get subscription status for user ${user.id}:`, error);
            throw error;
        }
    }
}