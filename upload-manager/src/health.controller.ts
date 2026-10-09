import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
    @Get()
    health() {
        return { status: 'ok', service: 'upload-manager', timestamp: new Date().toISOString() };
    }
}
