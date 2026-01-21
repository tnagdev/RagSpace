import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthenticationModule } from './authentication/authentication.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `${process.env.NODE_ENV ? `.env.${process.env.NODE_ENV}` : '.env'}`,
    }),
    PrismaModule,
    AuthenticationModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule { }
