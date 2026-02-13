import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PaymentClientService } from './payment-client.service';

@Injectable()
export class PlanGuard implements CanActivate {
    private readonly logger = new Logger(PlanGuard.name);

    constructor(
        private reflector: Reflector,
        private paymentClient: PaymentClientService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const requiredPlan = this.reflector.get<string>(
            'requiredPlan',
            context.getHandler(),
        );

        if (!requiredPlan) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const user = request.user;

        if (!user || !user.id) {
            this.logger.warn('No user found in request for plan check');
            return true; // Let auth guard handle this
        }

        // Validate plan access
        const validation = await this.paymentClient.validatePlanAccess(
            user.id,
            requiredPlan as any,
        );

        if (!validation.hasAccess) {
            throw new ForbiddenException({
                message: validation.message || `${requiredPlan} plan or higher required`,
                currentPlan: validation.currentPlan,
                requiredPlan: validation.requiredPlan,
            });
        }

        return true;
    }
}
