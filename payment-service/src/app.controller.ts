import { Controller, Get } from '@nestjs/common';
import { Public } from './common/decorators';

@Controller()
export class AppController {
    @Public()
    @Get()
    getStatus() {
        return {
            service: 'Payment Service',
            status: 'running',
            version: '1.0.0',
        };
    }

    @Public()
    @Get('health')
    healthCheck() {
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
        };
    }
}
