import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import {
    UsageMetricType,
    PaymentEndpoints,
} from '@ragspace/shared-ts';
import type { UsageCheckResult, PlanValidationResult } from '@ragspace/shared-ts';

export { UsageMetricType };
export type { UsageCheckResult, PlanValidationResult };

@Injectable()
export class PaymentClientService {
    private readonly logger = new Logger(PaymentClientService.name);
    private readonly baseUrl: string;
    private readonly serviceName: string;

    constructor(
        private httpService: HttpService,
        private configService: ConfigService,
    ) {
        this.baseUrl = this.configService.get<string>('paymentServiceUrl') ?? 'http://localhost:8006';
        this.serviceName = this.configService.get('SERVICE_NAME', 'upload-manager');
    }

    private serviceHeaders(userId: string): Record<string, string> {
        return {
            'x-user': JSON.stringify({ id: userId }),
            'x-service': this.serviceName,
        };
    }

    async checkUsage(userId: string, metric: UsageMetricType, amount = 1): Promise<UsageCheckResult> {
        try {
            const response = await firstValueFrom(
                this.httpService.post(
                    `${this.baseUrl}${PaymentEndpoints.CHECK_USAGE}`,
                    { metric, amount },
                    { headers: this.serviceHeaders(userId), timeout: 5000 },
                ),
            );
            return { allowed: response.data.allowed, remaining: response.data.remaining, limit: response.data.limit };
        } catch (error) {
            this.logger.error(`Failed to check usage: ${error.message}`);
            return { allowed: true, message: 'Payment service unavailable, proceeding with operation' };
        }
    }

    async trackUsage(userId: string, metric: UsageMetricType, amount = 1, metadata?: any): Promise<void> {
        try {
            await firstValueFrom(
                this.httpService.post(
                    `${this.baseUrl}${PaymentEndpoints.TRACK_USAGE}`,
                    { metric, amount, metadata },
                    { headers: this.serviceHeaders(userId), timeout: 5000 },
                ),
            );
            this.logger.debug(`Tracked ${amount} ${metric} for user ${userId}`);
        } catch (error) {
            this.logger.error(`Failed to track usage: ${error.message}`);
        }
    }

    async decrementUsage(userId: string, metric: UsageMetricType, amount = 1): Promise<void> {
        try {
            await firstValueFrom(
                this.httpService.post(
                    `${this.baseUrl}${PaymentEndpoints.DECREMENT_USAGE}`,
                    { metric, amount },
                    { headers: this.serviceHeaders(userId), timeout: 5000 },
                ),
            );
            this.logger.debug(`Decremented ${amount} ${metric} for user ${userId}`);
        } catch (error) {
            this.logger.error(`Failed to decrement usage: ${error.message}`);
        }
    }

    async validatePlanAccess(
        userId: string,
        minPlanType: 'FREE' | 'BASIC' | 'PRO' | 'ENTERPRISE',
    ): Promise<PlanValidationResult> {
        try {
            const response = await firstValueFrom(
                this.httpService.get(`${this.baseUrl}${PaymentEndpoints.VALIDATE_PLAN}`, {
                    headers: this.serviceHeaders(userId),
                    timeout: 5000,
                }),
            );
            const currentPlan = response.data.planType;
            const planOrder = ['FREE', 'BASIC', 'PRO', 'ENTERPRISE'];
            const hasAccess = planOrder.indexOf(currentPlan) >= planOrder.indexOf(minPlanType);
            return {
                hasAccess,
                currentPlan,
                requiredPlan: minPlanType,
                message: hasAccess ? 'Access granted' : `${minPlanType} plan or higher required`,
            };
        } catch (error) {
            this.logger.error(`Failed to validate plan access: ${error.message}`);
            return { hasAccess: true, message: 'Payment service unavailable, proceeding with operation' };
        }
    }

    async getRemainingQuota(userId: string, metric: UsageMetricType): Promise<number> {
        try {
            const response = await firstValueFrom(
                this.httpService.get(
                    `${this.baseUrl}${PaymentEndpoints.REMAINING_QUOTA}?metric=${metric}`,
                    { headers: this.serviceHeaders(userId), timeout: 5000 },
                ),
            );
            return response.data.remaining;
        } catch (error) {
            this.logger.error(`Failed to get remaining quota: ${error.message}`);
            return Infinity;
        }
    }

    async getUsageStats(userId: string, metric?: UsageMetricType): Promise<any> {
        try {
            const url = metric
                ? `${this.baseUrl}${PaymentEndpoints.USAGE_STATS}?metric=${metric}`
                : `${this.baseUrl}${PaymentEndpoints.USAGE_STATS}`;
            const response = await firstValueFrom(
                this.httpService.get(url, { headers: this.serviceHeaders(userId), timeout: 5000 }),
            );
            return response.data;
        } catch (error) {
            this.logger.error(`Failed to get usage stats: ${error.message}`);
            return null;
        }
    }

    async getUserPlanLimits(userId: string): Promise<Record<string, number> | null> {
        try {
            const stats = await this.getUsageStats(userId);
            if (!stats?.quotas) return null;
            return Object.fromEntries(stats.quotas.map((q: any) => [q.metric, q.limit]));
        } catch (error) {
            this.logger.error(`Failed to get user plan limits: ${error.message}`);
            return null;
        }
    }
}
