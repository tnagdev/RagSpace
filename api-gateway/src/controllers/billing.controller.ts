import { Body, Controller, Delete, Get, HttpCode, Inject, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, Public } from '../auth/session.guard';
import type { SessionUser } from '../auth/session.service';
import { IdempotencyKey } from '../http/request';
import * as map from '../mappers';
import { BILLING, FILES } from '../rpc/clients';
import type { BillingClient, FilesClient } from '../rpc/clients';

@Controller()
export class BillingController {
    constructor(
        @Inject(BILLING) private readonly billing: BillingClient,
        @Inject(FILES) private readonly files: FilesClient,
    ) {}

    @Public()
    @Get('plans')
    async plans(@CurrentUser() user: SessionUser | null, @Res({ passthrough: true }) res: Response) {
        const response = await this.billing.listPlans({ userId: user?.id });
        if (!user) res.setHeader('Cache-Control', 'public, max-age=300');
        return { items: response.plans.map(map.plan) };
    }

    @Get('subscription')
    async subscription(@CurrentUser() user: SessionUser) {
        const response = await this.billing.getSubscription({ userId: user.id });
        return map.subscription(response.subscription);
    }

    @Post('subscription/change-plan')
    @HttpCode(200)
    async changePlan(@CurrentUser() user: SessionUser, @Body() body: { planId: string }, @IdempotencyKey() requestId: string) {
        const response = await this.billing.changePlan({ userId: user.id, planId: body.planId, requestId, email: user.email });
        return { subscription: map.subscription(response.subscription), checkoutUrl: response.checkoutUrl ?? null };
    }

    @Post('subscription/cancel')
    @HttpCode(200)
    async cancel(@CurrentUser() user: SessionUser, @Body() body: { immediate?: boolean }) {
        const response = await this.billing.cancelSubscription({ userId: user.id, immediate: Boolean(body?.immediate) });
        return map.subscription(response.subscription);
    }

    @Post('subscription/pause')
    @HttpCode(200)
    async pause(@CurrentUser() user: SessionUser) {
        const response = await this.billing.pauseSubscription({ userId: user.id });
        return map.subscription(response.subscription);
    }

    @Post('subscription/resume')
    @HttpCode(200)
    async resume(@CurrentUser() user: SessionUser) {
        const response = await this.billing.resumeSubscription({ userId: user.id });
        return map.subscription(response.subscription);
    }

    @Delete('subscription/scheduled-change')
    async cancelScheduledChange(@CurrentUser() user: SessionUser) {
        const response = await this.billing.cancelScheduledChange({ userId: user.id });
        return map.subscription(response.subscription);
    }

    @Get('usage')
    async usage(@CurrentUser() user: SessionUser) {
        const [quotas, storage] = await Promise.all([
            this.billing.getUsage({ userId: user.id }),
            this.files.getStorageStats({ userId: user.id }),
        ]);
        return map.usage(quotas, storage);
    }
}
