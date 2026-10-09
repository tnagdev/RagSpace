import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthHttpController } from './auth-http.controller';
import { AuthRpcService } from './auth-rpc.service';
import { UsersService } from './users.service';

@Module({
    imports: [PrismaModule],
    controllers: [AuthHttpController],
    providers: [UsersService, AuthRpcService],
    exports: [AuthRpcService],
})
export class AuthModule { }
