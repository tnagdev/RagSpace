import { Module } from '@nestjs/common';
import { SubscriptionModule } from '../subscription/subscription.module';
import { WebhookService } from './webhook.service';

@Module({
    imports: [SubscriptionModule],
    providers: [WebhookService],
    exports: [WebhookService],
})
export class WebhookModule { }
