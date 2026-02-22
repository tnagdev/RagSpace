import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { PlanService } from './plan.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { Public, CurrentUser, AuthUser } from '../common/decorators';
import { PlanType, PlanInterval } from '@prisma/client';

@Controller('/plans')
export class PlanController {
    constructor(
        private planService: PlanService,
        private subscriptionService: SubscriptionService,
    ) { }

    @Public()
    @Get()
    async getAllPlans() {
        return this.planService.getAllPlans();
    }

    @Public()
    @Get('with-comparison')
    async getPlansWithComparison(@CurrentUser() user: AuthUser) {
        const subscription = user?.id
            ? await this.subscriptionService.getUserSubscription(user.id)
            : null;
        const currentPlanType = subscription?.plan?.type;

        return this.planService.getPlansWithComparison(currentPlanType);
    }

    @Public()
    @Get(':id')
    async getPlanById(@Param('id') id: string) {
        return this.planService.getPlanById(id);
    }

    @Post()
    async createPlan(@Body() data: any) {
        return this.planService.createPlan(data);
    }

    @Patch(':id')
    async updatePlan(@Param('id') id: string, @Body() data: any) {
        return this.planService.updatePlan(id, data);
    }

    @Patch(':id/deactivate')
    async deactivatePlan(@Param('id') id: string) {
        return this.planService.deactivatePlan(id);
    }
}
