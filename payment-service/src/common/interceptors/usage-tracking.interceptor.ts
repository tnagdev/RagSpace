import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { UsageService } from '../../usage/usage.service';

@Injectable()
export class UsageTrackingInterceptor implements NestInterceptor {
    constructor(private usageService: UsageService) { }

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const request = context.switchToHttp().getRequest();
        const userId = request.headers['x-user-id'];
        const usageTracking = request.usageTracking;

        return next.handle().pipe(
            tap(async () => {
                if (userId && usageTracking) {
                    await this.usageService.trackUsage(
                        userId,
                        usageTracking.metric,
                        usageTracking.amount,
                        {
                            endpoint: request.url,
                            method: request.method,
                            ipAddress: request.ip,
                            userAgent: request.headers['user-agent'],
                        },
                    );
                }
            }),
        );
    }
}
