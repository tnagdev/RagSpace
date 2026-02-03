import { Module } from '@nestjs/common';
import { CollectionController } from '../controllers/collection.controller';
import { CollectionService } from '../services/collection.service';
import { PrismaModule } from '../prisma/prisma.module';
import { S3Module } from '../s3/s3.module';

@Module({
    imports: [PrismaModule, S3Module],
    controllers: [CollectionController],
    providers: [CollectionService],
    exports: [CollectionService],
})
export class CollectionModule { }
