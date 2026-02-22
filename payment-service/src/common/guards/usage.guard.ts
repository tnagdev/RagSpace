import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CHECK_USAGE_KEY, UsageCheck } from '../decorators/check-usage.decorator';
import { UsageService } from '../../usage/usage.service';

@Injectable()
export class UsageGuard implements CanActivate {
    constructor(
        private reflector: Reflector,
        @Inject(UsageService)
        private usageService: UsageService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const usageCheck = this.reflector.getAllAndOverride<UsageCheck>(
            CHECK_USAGE_KEY,
            [context.getHandler(), context.getClass()],
        );

        if (!usageCheck) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const userId = request.headers['x-user-id'];

        if (!userId) {
            throw new ForbiddenException('User authentication required');
        }

        const canProceed = await this.usageService.checkAndReserveUsage(
            userId,
            usageCheck.metric,
            usageCheck.amount || 1,
        );

        if (!canProceed) {
            throw new ForbiddenException(
                `Usage limit exceeded for ${usageCheck.metric}. Please upgrade your plan.`,
            );
        }

        // Store usage info in request for later tracking
        request.usageTracking = {
            metric: usageCheck.metric,
            amount: usageCheck.amount || 1,
        };

        return true;
    }
}
