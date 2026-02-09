import { Module } from '@nestjs/common';
import { CollectionController } from './collection.controller';
import { CollectionService } from './collection.service';
import { PrismaModule } from '../prisma/prisma.module';
import { S3Module } from '../s3/s3.module';
import { UploadModule } from '../upload/upload.module';

@Module({
    imports: [PrismaModule, S3Module, UploadModule],
    controllers: [CollectionController],
    providers: [CollectionService],
    exports: [CollectionService],
})

export class CollectionModule { }
