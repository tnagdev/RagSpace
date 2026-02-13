import { Module, Global } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PaymentClientService } from './payment-client.service';
import { QuotaGuard } from './quota.guard';
import { PlanGuard } from './plan.guard';
import { UsageTrackingInterceptor } from './usage-tracking.interceptor';

@Global()
@Module({
    imports: [
        HttpModule.register({
            timeout: 5000,
            maxRedirects: 5,
        }),
        ConfigModule,
    ],
    providers: [
        PaymentClientService,
        QuotaGuard,
        PlanGuard,
        UsageTrackingInterceptor,
        // Register guards globally so they work with decorators
        {
            provide: APP_GUARD,
            useClass: QuotaGuard,
        },
        {
            provide: APP_GUARD,
            useClass: PlanGuard,
        },
        // Register interceptor globally for automatic usage tracking
        {
            provide: APP_INTERCEPTOR,
            useClass: UsageTrackingInterceptor,
        },
    ],
    exports: [PaymentClientService, QuotaGuard, PlanGuard, UsageTrackingInterceptor],
})
export class PaymentModule { }
