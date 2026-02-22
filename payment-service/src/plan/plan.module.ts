import { Module, forwardRef } from '@nestjs/common';
import { PlanController } from './plan.controller';
import { PlanService } from './plan.service';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
    imports: [forwardRef(() => SubscriptionModule)],
    controllers: [PlanController],
    providers: [PlanService],
    exports: [PlanService],
})
export class PlanModule { }
