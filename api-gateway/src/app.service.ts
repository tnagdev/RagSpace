import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: 'ok',
      service: 'api-gateway',
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV || 'development',
      port: process.env.PORT
    };
  }
}