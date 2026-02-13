import { Module } from '@nestjs/common';
import { ValidationService } from './validation.service';
import { ValidationController } from './validation.controller';
import { SubscriptionModule } from '../subscription/subscription.module';
import { PlanModule } from '../plan/plan.module';

@Module({
    imports: [SubscriptionModule, PlanModule],
    controllers: [ValidationController],
    providers: [ValidationService],
    exports: [ValidationService],
})
export class ValidationModule { }
