import { SetMetadata } from '@nestjs/common';
import { UsageMetricType } from '@prisma/client';

export const CHECK_USAGE_KEY = 'checkUsage';

export interface UsageCheck {
    metric: UsageMetricType;
    amount?: number;
}

export const CheckUsage = (check: UsageCheck) =>
    SetMetadata(CHECK_USAGE_KEY, check);
