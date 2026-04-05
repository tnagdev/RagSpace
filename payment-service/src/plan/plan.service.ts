import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlanType, PlanInterval, UsageMetricType } from '@prisma/client';

export interface PlanLimits {
    [UsageMetricType.CONVERSATIONS]?: number;
    [UsageMetricType.STORAGE]?: number;
    [UsageMetricType.FILE_CONVERSATIONS]?: number;
    [UsageMetricType.YOUTUBE_VIDEOS]?: number;
    [UsageMetricType.MAX_VIDEO_LENGTH]?: number;
    [key: string]: number | undefined; // Index signature for Record compatibility
}

@Injectable()
export class PlanService {
    private readonly logger = new Logger(PlanService.name);

    constructor(private prisma: PrismaService) { }

    async createPlan(data: {
        name: string;
        description?: string;
        type: PlanType;
        interval: PlanInterval;
        price: number;
        limits: PlanLimits;
        features: string[];
        lemonSqueezyVariantId?: string;
        lemonSqueezyProductId?: string;
        razorpayPlanId?: string;
    }) {
        return this.prisma.plan.create({
            data: {
                ...data,
                limits: data.limits as any,
            },
        });
    }

    async getAllPlans(isActive: boolean = true) {
        return this.prisma.plan.findMany({
            where: { isActive },
            orderBy: { price: 'asc' },
        });
    }

    async getPlanById(id: string) {
        const plan = await this.prisma.plan.findUnique({
            where: { id },
        });

        if (!plan) {
            throw new NotFoundException('Plan not found');
        }

        return plan;
    }

    async getPlanByType(type: PlanType) {
        const plan = await this.prisma.plan.findUnique({
            where: { type },
        });

        if (!plan) {
            throw new NotFoundException('Plan not found');
        }

        return plan;
    }

    async updatePlan(
        id: string,
        data: {
            name?: string;
            description?: string;
            price?: number;
            limits?: PlanLimits;
            features?: string[];
            isActive?: boolean;
        },
    ) {
        return this.prisma.plan.update({
            where: { id },
            data: data.limits ? { ...data, limits: data.limits as any } : data,
        });
    }

    async deactivatePlan(id: string) {
        return this.prisma.plan.update({
            where: { id },
            data: { isActive: false },
        });
    }

    getPlanLimits(plan: any): PlanLimits {
        return plan.limits as PlanLimits;
    }

    getMetricLimit(plan: any, metric: UsageMetricType): number {
        const limits = this.getPlanLimits(plan);
        return limits[metric] || 0;
    }

    comparePlans(planType1: PlanType, planType2: PlanType): number {
        const order = [PlanType.FREE, PlanType.BASIC, PlanType.PRO];
        return order.indexOf(planType1) - order.indexOf(planType2);
    }

    isUpgrade(currentPlanType: PlanType, newPlanType: PlanType): boolean {
        return this.comparePlans(newPlanType, currentPlanType) > 0;
    }

    isDowngrade(currentPlanType: PlanType, newPlanType: PlanType): boolean {
        return this.comparePlans(newPlanType, currentPlanType) < 0;
    }

    async getPlansWithComparison(currentPlanType?: PlanType) {
        const plans = await this.getAllPlans();

        if (!currentPlanType) {
            return plans.map(plan => ({
                ...plan,
                comparison: 'available' as const,
            }));
        }

        return plans.map(plan => {
            if (plan.type === currentPlanType) {
                return { ...plan, comparison: 'current' as const };
            } else if (this.isUpgrade(currentPlanType, plan.type)) {
                return { ...plan, comparison: 'upgrade' as const };
            } else {
                return { ...plan, comparison: 'downgrade' as const };
            }
        });
    }
}
