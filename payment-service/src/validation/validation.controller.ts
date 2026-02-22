import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { ValidationService } from './validation.service';
import { CurrentUser, AuthUser, Public } from '../common/decorators';

@Controller('/validation')
export class ValidationController {
    constructor(private validationService: ValidationService) { }

    @Get('plan-type')
    async getPlanType(@CurrentUser() user: AuthUser) {
        const planType = await this.validationService.getUserPlanType(user.id);
        return { planType };
    }

    @Get('features')
    async getFeatures(@CurrentUser() user: AuthUser) {
        const features = await this.validationService.getActiveFeatures(user.id);
        return { features };
    }

    @Post('feature')
    async checkFeature(
        @CurrentUser() user: AuthUser,
        @Body() body: { feature: string },
    ) {
        const hasAccess = await this.validationService.hasFeatureAccess(
            user.id,
            body.feature,
        );
        return { hasAccess };
    }

    @Public()
    @Post('bulk')
    async validateBulkUsers(@Body() body: { userIds: string[] }) {
        const results = await this.validationService.validateBulkUsers(body.userIds);
        return results;
    }
}
