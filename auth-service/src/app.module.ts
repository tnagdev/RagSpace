import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthenticationModule } from './authentication/authentication.module';
import { PrismaModule } from './prisma/prisma.module';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `${process.env.NODE_ENV ? `.env.${process.env.NODE_ENV}` : '.env'}`,
      load: [configuration],
    }),
    PrismaModule,
    AuthenticationModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule { }
