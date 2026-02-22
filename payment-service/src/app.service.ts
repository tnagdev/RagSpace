import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
    getStatus(): string {
        return 'Payment Service is running';
    }
}
