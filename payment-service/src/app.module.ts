import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { LemonSqueezyModule } from './providers/lemon-squeezy/lemon-squeezy.module';
import { PlanModule } from './plan/plan.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { UsageModule } from './usage/usage.module';
import { ValidationModule } from './validation/validation.module';
import { WebhookModule } from './webhook/webhook.module';
import { AuthGuard } from './common/guards/auth.guard';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: '.env',
        }),
        ScheduleModule.forRoot(),
        PrismaModule,
        LemonSqueezyModule,
        PlanModule,
        SubscriptionModule,
        UsageModule,
        ValidationModule,
        WebhookModule,
    ],
    controllers: [AppController],
    providers: [
        AppService,
        {
            provide: APP_GUARD,
            useClass: AuthGuard,
        },
    ],
})
export class AppModule { }
