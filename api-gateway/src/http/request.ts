import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ValidatedRequest } from './openapi-validator';

// The validated, type-coerced parameters attached by OpenApiValidator.
export const Api = createParamDecorator((_data: unknown, context: ExecutionContext): ValidatedRequest => {
    return context.switchToHttp().getResponse<Response>().locals.api;
});

export const IdempotencyKey = createParamDecorator((_data: unknown, context: ExecutionContext): string => {
    return context.switchToHttp().getRequest<Request>().header('idempotency-key') ?? '';
});

export function location(res: Response, path: string): void {
    res.setHeader('Location', `/api/v1${path}`);
}
