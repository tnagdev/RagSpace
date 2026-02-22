import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { SubscriptionModule } from '../subscription/subscription.module';
import { PlanModule } from '../plan/plan.module';

@Module({
    imports: [SubscriptionModule, PlanModule],
    controllers: [WebhookController],
    providers: [WebhookService],
})
export class WebhookModule { }
