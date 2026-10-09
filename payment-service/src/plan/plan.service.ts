import { Injectable, NotFoundException } from '@nestjs/common';
import { Plan, PlanType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type PlanLimits = Record<string, number>;

const PLAN_ORDER: PlanType[] = [PlanType.FREE, PlanType.BASIC, PlanType.PRO];

@Injectable()
export class PlanService {
    constructor(private prisma: PrismaService) { }

    getAllPlans(): Promise<Plan[]> {
        return this.prisma.plan.findMany({ where: { isActive: true }, orderBy: { price: 'asc' } });
    }

    async getPlanById(id: string): Promise<Plan> {
        const plan = await this.prisma.plan.findUnique({ where: { id } });
        if (!plan) throw new NotFoundException('Plan not found');
        return plan;
    }

    async getPlanByType(type: PlanType): Promise<Plan> {
        const plan = await this.prisma.plan.findUnique({ where: { type } });
        if (!plan) throw new NotFoundException('Plan not found');
        return plan;
    }

    getPlanLimits(plan: Plan): PlanLimits {
        return (plan.limits ?? {}) as PlanLimits;
    }

    comparePlans(planType1: PlanType, planType2: PlanType): number {
        return PLAN_ORDER.indexOf(planType1) - PLAN_ORDER.indexOf(planType2);
    }

    isUpgrade(currentPlanType: PlanType, newPlanType: PlanType): boolean {
        return this.comparePlans(newPlanType, currentPlanType) > 0;
    }

    isDowngrade(currentPlanType: PlanType, newPlanType: PlanType): boolean {
        return this.comparePlans(newPlanType, currentPlanType) < 0;
    }
}
