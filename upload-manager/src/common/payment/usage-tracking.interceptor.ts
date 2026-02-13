import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
    Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PaymentClientService } from './payment-client.service';

/**
 * Interceptor that automatically tracks usage after successful route execution
 * Only tracks if quota was checked by QuotaGuard
 */
@Injectable()
export class UsageTrackingInterceptor implements NestInterceptor {
    private readonly logger = new Logger(UsageTrackingInterceptor.name);

    constructor(private paymentClient: PaymentClientService) { }

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const request = context.switchToHttp().getRequest();
        const quotaCheck = request.quotaCheck;

        if (!quotaCheck) {
            // No quota check was performed, skip tracking
            return next.handle();
        }

        return next.handle().pipe(
            tap({
                next: async (response) => {
                    // Track usage after successful operation
                    try {
                        const metadata = {
                            path: request.path,
                            method: request.method,
                            timestamp: new Date().toISOString(),
                        };

                        await this.paymentClient.trackUsage(
                            quotaCheck.userId,
                            quotaCheck.metric,
                            quotaCheck.amount,
                            metadata,
                        );

                        this.logger.debug(
                            `Tracked ${quotaCheck.amount} ${quotaCheck.metric} for user ${quotaCheck.userId}`,
                        );
                    } catch (error) {
                        this.logger.error(
                            `Failed to track usage: ${error.message}`,
                        );
                    }
                },
                error: () => {
                    // Don't track usage on error
                    this.logger.debug(
                        `Skipping usage tracking due to error in route handler`,
                    );
                },
            }),
        );
    }
}
