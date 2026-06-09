import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AuthenticationController } from './authentication.controller';
import { AuthenticationService } from './authentication.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthGuard } from './guards/auth.guard';
import { RabbitmqService } from 'src/common/services/rabbitmq.service';
import { PaymentService } from 'src/common/services/payment.service';
import { BaseHttpClient } from 'src/common/services/http.service';
import { HttpModule } from '@nestjs/axios/dist/http.module';

@Module({
  imports: [
    PrismaModule,
    HttpModule
  ],
  controllers: [AuthenticationController],
  providers: [
    AuthenticationService,
    RabbitmqService,
    PaymentService,
    BaseHttpClient,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AuthenticationModule { }
