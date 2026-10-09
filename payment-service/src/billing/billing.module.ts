import { Module } from '@nestjs/common';
import { PlanModule } from '../plan/plan.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { UsageModule } from '../usage/usage.module';
import { WebhookModule } from '../webhook/webhook.module';
import { BillingEventsService } from './billing-events.service';
import { BillingRpcService } from './billing-rpc.service';

@Module({
    imports: [PlanModule, SubscriptionModule, UsageModule, WebhookModule],
    providers: [BillingRpcService, BillingEventsService],
    exports: [BillingRpcService],
})
export class BillingModule { }
