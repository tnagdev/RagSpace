import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './modules/prisma/prisma.module';
import { UploadModule } from './modules/upload/upload.module';
import { MetadataModule } from './modules/metadata/metadata.module';
import { S3Module } from './modules/s3/s3.module';
import { RabbitmqModule } from './modules/rabbitmq/rabbitmq.module';
import { CollectionModule } from './modules/collection/collection.module';
import { PaymentModule } from './common/payment';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `${process.env.NODE_ENV ? `.env.${process.env.NODE_ENV}` : '.env'}`,
      load: [configuration],
    }),
    PaymentModule,
    PrismaModule,
    UploadModule,
    MetadataModule,
    S3Module,
    RabbitmqModule,
    CollectionModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
