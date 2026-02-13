import { Module } from '@nestjs/common';
import { UsageController } from './usage.controller';
import { UsageService } from './usage.service';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
    imports: [SubscriptionModule],
    controllers: [UsageController],
    providers: [UsageService],
    exports: [UsageService],
})
export class UsageModule { }
