import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WsGateway } from './ws.gateway';
import { WsService } from './ws.service';

@Module({
    imports: [ConfigModule],
    providers: [WsGateway, WsService],
    exports: [WsService],
})
export class WsModule { }
