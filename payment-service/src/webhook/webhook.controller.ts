import {
    Controller,
    Post,
    Body,
    Headers,
    BadRequestException,
    Logger,
} from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { LemonSqueezyService } from '../providers/lemon-squeezy/lemon-squeezy.service';
import { Public } from '../common/decorators';

@Controller('api/webhooks')
export class WebhookController {
    private readonly logger = new Logger(WebhookController.name);

    constructor(
        private webhookService: WebhookService,
        private lemonSqueezy: LemonSqueezyService,
    ) { }

    @Public()
    @Post('lemon-squeezy')
    async handleLemonSqueezyWebhook(
        @Headers('x-signature') signature: string,
        @Body() payload: any,
    ) {
        this.logger.log('Received Lemon Squeezy webhook');

        // Verify signature
        const payloadString = JSON.stringify(payload);
        const isValid = this.lemonSqueezy.verifyWebhookSignature(
            signature,
            payloadString,
        );

        if (!isValid) {
            this.logger.warn('Invalid webhook signature');
            throw new BadRequestException('Invalid signature');
        }

        try {
            const eventType = payload.meta?.event_name;
            if (!eventType) {
                throw new BadRequestException('Missing event type');
            }

            await this.webhookService.processWebhook(eventType, payload);

            return { received: true };
        } catch (error) {
            this.logger.error('Error processing webhook:', error);
            throw error;
        }
    }
}
