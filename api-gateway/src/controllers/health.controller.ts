import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/session.guard';

@Controller('health')
export class HealthController {
    @Public()
    @Get()
    health() {
        return { status: 'ok', service: 'api-gateway', timestamp: new Date().toISOString() };
    }
}
