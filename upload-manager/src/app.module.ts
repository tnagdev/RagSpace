import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { CollectionsModule } from './collections/collections.module';
import configuration from './config/configuration';
import { FilesModule } from './files/files.module';
import { HealthController } from './health.controller';
import { PrismaModule } from './modules/prisma/prisma.module';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        ScheduleModule.forRoot(),
        PrismaModule,
        FilesModule,
        CollectionsModule,
    ],
    controllers: [HealthController],
})
export class AppModule { }
