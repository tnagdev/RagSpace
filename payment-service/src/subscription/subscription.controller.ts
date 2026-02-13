import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { CurrentUser, AuthUser } from '../common/decorators';

@Controller('api/subscriptions')
export class SubscriptionController {
    constructor(private subscriptionService: SubscriptionService) { }

    @Get('current')
    async getCurrentSubscription(@CurrentUser() user: AuthUser) {
        return this.subscriptionService.getUserSubscription(user.id);
    }

    @Get('usage')
    async getUsage(@CurrentUser() user: AuthUser) {
        return this.subscriptionService.getSubscriptionUsage(user.id);
    }

    @Post('checkout')
    async createCheckout(
        @CurrentUser() user: AuthUser,
        @Body() body: { planId: string },
    ) {
        return this.subscriptionService.createCheckoutSession(
            user.id,
            body.planId,
            user.email,
        );
    }

    @Patch('upgrade')
    async upgrade(@CurrentUser() user: AuthUser, @Body() body: { planId: string }) {
        return this.subscriptionService.upgradeSubscription(user.id, body.planId);
    }

    @Patch('downgrade')
    async downgrade(@CurrentUser() user: AuthUser, @Body() body: { planId: string }) {
        return this.subscriptionService.downgradeSubscription(user.id, body.planId);
    }

    @Delete('cancel')
    async cancel(@CurrentUser() user: AuthUser, @Body() body?: { immediate?: boolean }) {
        return this.subscriptionService.cancelSubscription(
            user.id,
            body?.immediate || false,
        );
    }

    @Patch('pause')
    async pause(@CurrentUser() user: AuthUser) {
        return this.subscriptionService.pauseSubscription(user.id);
    }

    @Patch('resume')
    async resume(@CurrentUser() user: AuthUser) {
        return this.subscriptionService.resumeSubscription(user.id);
    }
}
