import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { UsageService } from './usage.service';
import { CurrentUser, AuthUser } from '../common/decorators';
import { UsageMetricType } from '@prisma/client';

@Controller('/usage')
export class UsageController {
    constructor(private usageService: UsageService) { }

    @Get('stats')
    async getStats(
        @CurrentUser() user: AuthUser,
        @Query('metric') metric?: UsageMetricType,
    ) {
        return this.usageService.getUserUsageStats(user.id, metric);
    }

    @Get('history')
    async getHistory(
        @CurrentUser() user: AuthUser,
        @Query('metric') metric?: UsageMetricType,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
    ) {
        return this.usageService.getUsageHistory(
            user.id,
            metric,
            startDate ? new Date(startDate) : undefined,
            endDate ? new Date(endDate) : undefined,
        );
    }

    @Post('check')
    async checkUsage(
        @CurrentUser() user: AuthUser,
        @Body() body: { metric: UsageMetricType; amount?: number },
    ) {
        const canProceed = await this.usageService.checkAndReserveUsage(
            user.id,
            body.metric,
            body.amount || 1,
        );

        const remaining = await this.usageService.getRemainingQuota(user.id, body.metric);
        const stats = await this.usageService.getUserUsageStats(user.id, body.metric);

        const quota = stats?.quotas?.find((q: any) => q.metric === body.metric);
        const limit = quota?.limit || 0;

        return {
            allowed: canProceed,
            remaining,
            limit: limit === 0 ? 'unlimited' : limit,
        };
    }

    @Get('remaining')
    async getRemainingQuota(
        @CurrentUser() user: AuthUser,
        @Query('metric') metric: UsageMetricType,
    ) {
        const remaining = await this.usageService.getRemainingQuota(user.id, metric);
        return { metric, remaining };
    }

    @Post('track')
    async trackUsage(
        @CurrentUser() user: AuthUser,
        @Body() body: { metric: UsageMetricType; amount?: number; metadata?: any },
    ) {
        await this.usageService.trackUsage(
            user.id,
            body.metric,
            body.amount || 1,
            body.metadata,
        );

        return { success: true };
    }

    @Post('decrement')
    async decrementUsage(
        @CurrentUser() user: AuthUser,
        @Body() body: { metric: UsageMetricType; amount?: number },
    ) {
        await this.usageService.decrementUsage(
            user.id,
            body.metric,
            body.amount || 1,
        );

        return { success: true };
    }
}
