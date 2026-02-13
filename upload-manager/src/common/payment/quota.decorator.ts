import { SetMetadata } from '@nestjs/common';
import { UsageMetricType } from './payment-client.service';
import { QuotaCheckConfig } from './quota.guard';

/**
 * Decorator to check user quota before executing route handler
 * 
 * @example
 * // Check storage quota based on file size
 * @CheckQuota({
 *   metric: UsageMetricType.STORAGE,
 *   getAmount: (req) => req.file.size
 * })
 * uploadFile(@CurrentUser() user, @UploadedFile() file) {}
 * 
 * @example
 * // Check document quota (fixed amount)
 * @CheckQuota({ metric: UsageMetricType.DOCUMENTS, amount: 1 })
 * createDocument() {}
 */
export const CheckQuota = (config: QuotaCheckConfig) => SetMetadata('quota', config);

/**
 * Decorator to require minimum plan tier
 */
export const RequirePlan = (minPlan: 'FREE' | 'BASIC' | 'PRO' | 'ENTERPRISE') =>
    SetMetadata('requiredPlan', minPlan);
