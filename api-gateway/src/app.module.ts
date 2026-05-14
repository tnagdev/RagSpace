import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { HttpModule } from '@nestjs/axios';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ProxyModule } from './modules/proxy/proxy.module';
import { AuthGuard } from './guards/auth.guard';
import { CustomThrottlerGuard } from './guards/throttler.guard';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { RATE_LIMIT_CONFIG } from './config/rate-limit.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `${process.env.NODE_ENV ? `.env.${process.env.NODE_ENV}` : '.env'}`,
    }),
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: RATE_LIMIT_CONFIG.ttl * 1000,
        limit: RATE_LIMIT_CONFIG.limit,
      },
    ]),
    ProxyModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule { }
