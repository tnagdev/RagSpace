import { SetMetadata } from '@nestjs/common';
import { UsageMetricType } from '@prisma/client';

export const REQUIRE_PLAN_KEY = 'requirePlan';

export interface PlanRequirement {
    metrics?: UsageMetricType[];
    minPlanType?: 'FREE' | 'BASIC' | 'PRO' | 'ENTERPRISE';
    allowTrial?: boolean;
}

export const RequirePlan = (requirement: PlanRequirement) =>
    SetMetadata(REQUIRE_PLAN_KEY, requirement);
