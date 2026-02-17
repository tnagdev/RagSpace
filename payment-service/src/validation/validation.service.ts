import { Injectable, Logger } from '@nestjs/common';
import { SubscriptionService } from '../subscription/subscription.service';
import { PlanService } from '../plan/plan.service';
import { PlanRequirement } from '../common/decorators/require-plan.decorator';
import { PlanType, SubscriptionStatus } from '@prisma/client';

@Injectable()
export class ValidationService {
    private readonly logger = new Logger(ValidationService.name);

    constructor(
        private subscriptionService: SubscriptionService,
        private planService: PlanService,
    ) { }

    async validatePlanAccess(
        userId: string,
        requirement: PlanRequirement,
    ): Promise<boolean> {
        const subscription = await this.subscriptionService.getUserSubscription(userId);

        if (!subscription) {
            this.logger.warn(`No subscription found for user ${userId}`);
            return false;
        }

        // Check if subscription is in valid state
        const validStatuses: SubscriptionStatus[] = [SubscriptionStatus.ACTIVE];
        if (requirement.allowTrial) {
            validStatuses.push(SubscriptionStatus.TRIALING);
        }

        if (!validStatuses.includes(subscription.status)) {
            this.logger.warn(
                `Invalid subscription status for user ${userId}: ${subscription.status}`,
            );
            return false;
        }

        // Check minimum plan type
        if (requirement.minPlanType) {
            const comparison = this.planService.comparePlans(
                subscription.plan.type,
                requirement.minPlanType as PlanType,
            );

            if (comparison < 0) {
                this.logger.warn(
                    `User ${userId} plan ${subscription.plan.type} does not meet minimum ${requirement.minPlanType}`,
                );
                return false;
            }
        }

        // Check metric availability
        if (requirement.metrics && requirement.metrics.length > 0) {
            const limits = this.planService.getPlanLimits(subscription.plan);

            for (const metric of requirement.metrics) {
                const limit = limits[metric];
                if (limit === undefined) {
                    this.logger.warn(
                        `Metric ${metric} not available in plan ${subscription.plan.type}`,
                    );
                    return false;
                }
            }
        }

        return true;
    }

    async getUserPlanType(userId: string): Promise<PlanType | null> {
        const subscription = await this.subscriptionService.getUserSubscription(userId);
        return subscription?.plan.type || null;
    }

    async hasFeatureAccess(userId: string, feature: string): Promise<boolean> {
        const subscription = await this.subscriptionService.getUserSubscription(userId);

        if (!subscription) {
            return false;
        }

        return subscription.plan.features.includes(feature);
    }

    async getActiveFeatures(userId: string): Promise<string[]> {
        const subscription = await this.subscriptionService.getUserSubscription(userId);

        if (!subscription) {
            return [];
        }

        return subscription.plan.features;
    }

    async validateBulkUsers(userIds: string[]): Promise<Record<string, boolean>> {
        const results: Record<string, boolean> = {};

        await Promise.all(
            userIds.map(async (userId) => {
                const subscription = await this.subscriptionService.getUserSubscription(
                    userId,
                );
                results[userId] = !!subscription;
            }),
        );

        return results;
    }
}
