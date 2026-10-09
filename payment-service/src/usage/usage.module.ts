import { Module } from '@nestjs/common';
import { SubscriptionModule } from '../subscription/subscription.module';
import { UsageService } from './usage.service';

@Module({
    imports: [SubscriptionModule],
    providers: [UsageService],
    exports: [UsageService],
})
export class UsageModule { }
