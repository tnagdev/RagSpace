import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PaymentClientService, UsageMetricType } from './payment-client.service';

export interface QuotaCheckConfig {
    metric: UsageMetricType;
    amount?: number;
    getAmount?: (request: any) => number | Promise<number>;
}

@Injectable()
export class QuotaGuard implements CanActivate {
    private readonly logger = new Logger(QuotaGuard.name);

    constructor(
        private reflector: Reflector,
        private paymentClient: PaymentClientService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const quotaConfig = this.reflector.get<QuotaCheckConfig>(
            'quota',
            context.getHandler(),
        );

        if (!quotaConfig) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const user = request.user;

        if (!user || !user.id) {
            this.logger.warn('No user found in request for quota check');
            return true; // Let auth guard handle this
        }

        // Calculate amount
        let amount = quotaConfig.amount || 1;
        if (quotaConfig.getAmount) {
            amount = await quotaConfig.getAmount(request);
        }

        // Check quota
        const check = await this.paymentClient.checkUsage(
            user.id,
            quotaConfig.metric,
            amount,
        );

        if (!check.allowed) {
            const limitDisplay = check.limit === 'unlimited' || check.limit === Infinity
                ? 'unlimited'
                : check.limit;

            throw new ForbiddenException({
                message: `Quota exceeded for ${quotaConfig.metric}`,
                metric: quotaConfig.metric,
                limit: limitDisplay,
                remaining: check.remaining || 0,
                required: amount,
            });
        }

        // Store quota info in request for later tracking
        request.quotaCheck = {
            metric: quotaConfig.metric,
            amount,
            userId: user.id,
        };

        return true;
    }
}
