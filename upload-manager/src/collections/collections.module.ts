import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { CollectionsRpcService } from './collections-rpc.service';
import { CollectionsService } from './collections.service';

@Module({
    imports: [FilesModule],
    providers: [CollectionsService, CollectionsRpcService],
    exports: [CollectionsRpcService],
})
export class CollectionsModule { }
