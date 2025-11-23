import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
    protected async getTracker(req: Record<string, any>): Promise<string> {
        return req.user?.id || req.ip;
    }

    protected async throwThrottlingException(context: ExecutionContext): Promise<void> {
        throw new ThrottlerException(
            'Too many requests. Please try again later.'
        );
    }
}
