import { Module, forwardRef } from '@nestjs/common';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { PlanModule } from '../plan/plan.module';
import { ProvidersModule } from '../providers/providers.module';

@Module({
    imports: [forwardRef(() => PlanModule), ProvidersModule],
    controllers: [SubscriptionController],
    providers: [SubscriptionService],
    exports: [SubscriptionService],
})
export class SubscriptionModule { }
