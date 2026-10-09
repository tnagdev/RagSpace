import { Module } from '@nestjs/common';
import { billingClientProvider } from '../clients/billing.client';
import { S3Module } from '../modules/s3/s3.module';
import { FileEventsService } from './file-events.service';
import { FilesRpcService } from './files-rpc.service';
import { FilesService } from './files.service';
import { MediaProbeService } from './media-probe.service';

@Module({
    imports: [S3Module],
    providers: [billingClientProvider, MediaProbeService, FilesService, FilesRpcService, FileEventsService],
    exports: [FilesService, FilesRpcService],
})
export class FilesModule { }
