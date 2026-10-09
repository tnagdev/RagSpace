import { Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { billingV1 } from '@ragspace/shared-ts';
import { Public } from '../auth/session.guard';
import type { ValidatedRequest } from '../http/openapi-validator';
import { Api } from '../http/request';
import { BILLING } from '../rpc/clients';
import type { BillingClient } from '../rpc/clients';

const PROVIDERS: Record<string, billingV1.PaymentProvider> = {
    'lemon-squeezy': billingV1.PaymentProvider.PAYMENT_PROVIDER_LEMON_SQUEEZY,
    razorpay: billingV1.PaymentProvider.PAYMENT_PROVIDER_RAZORPAY,
};
const FORWARDED_HEADERS = ['content-type', 'x-signature', 'x-razorpay-signature', 'x-event-name'];

@Controller('webhooks')
export class WebhooksController {
    constructor(@Inject(BILLING) private readonly billing: BillingClient) {}

    @Public()
    @Post(':provider')
    @HttpCode(204)
    async receive(@Api() api: ValidatedRequest, @Req() req: Request) {
        const headers: Record<string, string> = {};
        for (const name of FORWARDED_HEADERS) {
            const value = req.header(name);
            if (value) headers[name] = value;
        }
        await this.billing.handleWebhook({
            provider: PROVIDERS[api.params.provider],
            body: Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0),
            headers,
        });
    }
}
