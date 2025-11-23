import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  checkHealth(): {
    status: string;
    timestamp: string;
    host: string;
    port: number;
  } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      host: process.env.HOST || 'localhost',
      port: Number(process.env.PORT) || 8001,
    };
  }
}
