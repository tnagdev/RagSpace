import { Module } from '@nestjs/common';
import { PlanModule } from '../plan/plan.module';
import { SubscriptionService } from './subscription.service';

@Module({
    imports: [PlanModule],
    providers: [SubscriptionService],
    exports: [SubscriptionService],
})
export class SubscriptionModule { }
