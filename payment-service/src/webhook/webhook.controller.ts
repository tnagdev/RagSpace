import {
    Controller,
    Post,
    Body,
    Headers,
    BadRequestException,
    Logger,
} from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { PaymentProviderFactory } from '../providers/payment-provider.factory';
import { Public } from '../common/decorators';

@Controller('/webhooks')
export class WebhookController {
    private readonly logger = new Logger(WebhookController.name);

    constructor(
        private webhookService: WebhookService,
        private paymentFactory: PaymentProviderFactory,
    ) { }

    @Public()
    @Post('lemon-squeezy')
    async handleLemonSqueezyWebhook(
        @Headers('x-signature') signature: string,
        @Body() payload: any,
    ) {
        this.logger.log('Received Lemon Squeezy webhook');

        const payloadString = JSON.stringify(payload);
        const isValid = this.paymentFactory.getProvider().verifyWebhookSignature(signature, payloadString);

        if (!isValid) {
            this.logger.warn('Invalid webhook signature');
        }

        const eventType = payload.meta?.event_name;
        if (!eventType) {
            throw new BadRequestException('Missing event type');
        }

        this.logger.log(`Processing LemonSqueezy event: ${eventType}`);
        await this.webhookService.processWebhook(eventType, payload);

        return { received: true };
    }

    @Public()
    @Post('razorpay')
    async handleRazorpayWebhook(
        @Headers('x-razorpay-signature') signature: string,
        @Body() payload: any,
    ) {
        this.logger.log('Received Razorpay webhook');

        const payloadString = JSON.stringify(payload);
        const isValid = this.paymentFactory.getProvider().verifyWebhookSignature(signature, payloadString);

        if (!isValid) {
            this.logger.warn('Invalid Razorpay webhook signature');
        }

        const eventType = payload?.event;
        if (!eventType) {
            throw new BadRequestException('Missing event type in Razorpay webhook');
        }

        this.logger.log(`Processing Razorpay event: ${eventType}`);
        await this.webhookService.processRazorpayWebhook(eventType, payload);

        return { received: true };
    }
}

