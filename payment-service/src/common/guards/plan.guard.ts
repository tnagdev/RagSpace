import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_PLAN_KEY, PlanRequirement } from '../decorators/require-plan.decorator';
import { ValidationService } from '../../validation/validation.service';

@Injectable()
export class PlanGuard implements CanActivate {
    constructor(
        private reflector: Reflector,
        @Inject(ValidationService)
        private validationService: ValidationService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const requirement = this.reflector.getAllAndOverride<PlanRequirement>(
            REQUIRE_PLAN_KEY,
            [context.getHandler(), context.getClass()],
        );

        if (!requirement) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const userId = request.headers['x-user-id'];

        if (!userId) {
            throw new ForbiddenException('User authentication required');
        }

        const hasAccess = await this.validationService.validatePlanAccess(
            userId,
            requirement,
        );

        if (!hasAccess) {
            throw new ForbiddenException(
                'Your current plan does not support this feature. Please upgrade.',
            );
        }

        return true;
    }
}
