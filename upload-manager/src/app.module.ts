import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UploadModule } from './upload/upload.module';
import { MetadataModule } from './metadata/metadata.module';
import { S3Module } from './s3/s3.module';
import { RabbitmqModule } from './rabbitmq/rabbitmq.module';
import { CollectionModule } from './collection/collection.module';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `${process.env.NODE_ENV ? `.env.${process.env.NODE_ENV}` : '.env'}`,
      load: [configuration],
    }),
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
