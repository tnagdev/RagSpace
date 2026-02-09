import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { S3Module } from '../s3/s3.module';
import { RabbitmqModule } from '../rabbitmq/rabbitmq.module';

@Module({
    imports: [
        S3Module,
        RabbitmqModule,
        ConfigModule,
    ],
    controllers: [UploadController],
    providers: [UploadService],
    exports: [UploadService],
})
export class UploadModule { }
