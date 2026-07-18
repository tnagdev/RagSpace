import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { FileValidationService } from './file-validation.service';
import { S3Module } from '../s3/s3.module';
import { RabbitmqModule } from '../rabbitmq/rabbitmq.module';
import { PaymentModule, FileQuotaGuard } from '../../common/payment';

@Module({
    imports: [
        S3Module,
        RabbitmqModule,
        ConfigModule,
        PaymentModule,
    ],
    controllers: [UploadController],
    providers: [
        UploadService,
        FileValidationService,
        FileQuotaGuard,
    ],
    exports: [UploadService, FileValidationService],
})
export class UploadModule { }
