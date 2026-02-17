import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export enum UsageMetricType {
    CONVERSATIONS = 'CONVERSATIONS',
    STORAGE = 'STORAGE',
    FILE_CONVERSATIONS = 'FILE_CONVERSATIONS',
    YOUTUBE_VIDEOS = 'YOUTUBE_VIDEOS',
    MAX_VIDEO_LENGTH = 'MAX_VIDEO_LENGTH',
    MAX_AUDIO_DURATION = 'MAX_AUDIO_DURATION',
}

export interface UsageCheckResult {
    allowed: boolean;
    remaining?: number;
    limit?: number | 'unlimited';
    message?: string;
}

export interface PlanValidationResult {
    hasAccess: boolean;
    currentPlan?: string;
    requiredPlan?: string;
    message?: string;
}

@Injectable()
export class PaymentClientService {
    private readonly logger = new Logger(PaymentClientService.name);
    private readonly baseUrl: string;
    private readonly serviceName: string;

    constructor(
        private httpService: HttpService,
        private configService: ConfigService,
    ) {
        this.baseUrl = this.configService.get('PAYMENT_SERVICE_URL', 'http://localhost:3006');
        this.serviceName = this.configService.get('SERVICE_NAME', 'upload-manager');
    }

    /**
     * Check if user can perform an action based on usage quota
     */
    async checkUsage(
        userId: string,
        metric: UsageMetricType,
        amount: number = 1,
    ): Promise<UsageCheckResult> {
        try {
            const response = await firstValueFrom(
                this.httpService.post(
                    `${this.baseUrl}/api/usage/check`,
                    { metric, amount },
                    {
                        headers: {
                            'x-user': JSON.stringify({ id: userId }),
                            'x-service': this.serviceName,
                        },
                        timeout: 5000,
                    },
                ),
            );

            return {
                allowed: response.data.allowed,
                remaining: response.data.remaining,
                limit: response.data.limit,
            };
        } catch (error) {
            this.logger.error(`Failed to check usage: ${error.message}`);
            // Fail open - allow operation if payment service is down
            return {
                allowed: true,
                message: 'Payment service unavailable, proceeding with operation',
            };
        }
    }

    /**
     * Track usage after successful operation
     */
    async trackUsage(
        userId: string,
        metric: UsageMetricType,
        amount: number = 1,
        metadata?: any,
    ): Promise<void> {
        try {
            await firstValueFrom(
                this.httpService.post(
                    `${this.baseUrl}/api/usage/track`,
                    { metric, amount, metadata },
                    {
                        headers: {
                            'x-user': JSON.stringify({ id: userId }),
                            'x-service': this.serviceName,
                        },
                        timeout: 5000,
                    },
                ),
            );

            this.logger.debug(`Tracked ${amount} ${metric} for user ${userId}`);
        } catch (error) {
            this.logger.error(`Failed to track usage: ${error.message}`);
            // Don't throw - tracking failure shouldn't break the flow
        }
    }

    /**
     * Decrement usage (e.g., when deleting a resource)
     */
    async decrementUsage(
        userId: string,
        metric: UsageMetricType,
        amount: number = 1,
    ): Promise<void> {
        try {
            await firstValueFrom(
                this.httpService.post(
                    `${this.baseUrl}/api/usage/decrement`,
                    { metric, amount },
                    {
                        headers: {
                            'x-user': JSON.stringify({ id: userId }),
                            'x-service': this.serviceName,
                        },
                        timeout: 5000,
                    },
                ),
            );

            this.logger.debug(`Decremented ${amount} ${metric} for user ${userId}`);
        } catch (error) {
            this.logger.error(`Failed to decrement usage: ${error.message}`);
        }
    }

    /**
     * Validate if user's plan meets minimum requirements
     */
    async validatePlanAccess(
        userId: string,
        minPlanType: 'FREE' | 'BASIC' | 'PRO' | 'ENTERPRISE',
    ): Promise<PlanValidationResult> {
        try {
            const response = await firstValueFrom(
                this.httpService.get(`${this.baseUrl}/api/validation/plan-type`, {
                    headers: {
                        'x-user': JSON.stringify({ id: userId }),
                        'x-service': this.serviceName,
                    },
                    timeout: 5000,
                }),
            );

            const currentPlan = response.data.planType;
            const planOrder = ['FREE', 'BASIC', 'PRO', 'ENTERPRISE'];
            const userPlanIndex = planOrder.indexOf(currentPlan);
            const requiredPlanIndex = planOrder.indexOf(minPlanType);

            const hasAccess = userPlanIndex >= requiredPlanIndex;

            return {
                hasAccess,
                currentPlan,
                requiredPlan: minPlanType,
                message: hasAccess
                    ? 'Access granted'
                    : `${minPlanType} plan or higher required`,
            };
        } catch (error) {
            this.logger.error(`Failed to validate plan access: ${error.message}`);
            // Fail open
            return {
                hasAccess: true,
                message: 'Payment service unavailable, proceeding with operation',
            };
        }
    }

    /**
     * Get remaining quota for a metric
     */
    async getRemainingQuota(
        userId: string,
        metric: UsageMetricType,
    ): Promise<number> {
        try {
            const response = await firstValueFrom(
                this.httpService.get(
                    `${this.baseUrl}/api/usage/remaining?metric=${metric}`,
                    {
                        headers: {
                            'x-user': JSON.stringify({ id: userId }),
                            'x-service': this.serviceName,
                        },
                        timeout: 5000,
                    },
                ),
            );

            return response.data.remaining;
        } catch (error) {
            this.logger.error(`Failed to get remaining quota: ${error.message}`);
            return Infinity; // Fail open
        }
    }

    /**
     * Get usage statistics for a user
     */
    async getUsageStats(
        userId: string,
        metric?: UsageMetricType,
    ): Promise<any> {
        try {
            const url = metric
                ? `${this.baseUrl}/api/usage/stats?metric=${metric}`
                : `${this.baseUrl}/api/usage/stats`;

            const response = await firstValueFrom(
                this.httpService.get(url, {
                    headers: {
                        'x-user': JSON.stringify({ id: userId }),
                        'x-service': this.serviceName,
                    },
                    timeout: 5000,
                }),
            );

            return response.data;
        } catch (error) {
            this.logger.error(`Failed to get usage stats: ${error.message}`);
            return null;
        }
    }

    /**
     * Get user's plan limits
     */
    async getUserPlanLimits(userId: string): Promise<Record<string, number> | null> {
        try {
            const stats = await this.getUsageStats(userId);
            if (!stats || !stats.quotas) {
                return null;
            }

            const limits: Record<string, number> = {};
            for (const quota of stats.quotas) {
                limits[quota.metric] = quota.limit;
            }

            return limits;
        } catch (error) {
            this.logger.error(`Failed to get user plan limits: ${error.message}`);
            return null;
        }
    }
}
