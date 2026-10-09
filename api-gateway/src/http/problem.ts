import type { Response } from 'express';
import { FieldError, PROBLEM_CONTENT_TYPE, Problem, ProblemCode, Status, problem, rpcErrorInfo } from '@ragspace/shared-ts';

export class ApiError extends Error {
    constructor(
        readonly status: number,
        readonly code: ProblemCode,
        message?: string,
        readonly extra: Pick<Problem, 'errors' | 'metric' | 'used' | 'limit'> = {},
    ) {
        super(message ?? code);
    }
}

export const badRequest = (message: string, errors?: FieldError[]) =>
    new ApiError(400, 'validation_failed', message, errors ? { errors } : {});
export const unauthenticated = (message = 'Sign in to continue') => new ApiError(401, 'unauthenticated', message);
export const forbidden = (message: string) => new ApiError(403, 'forbidden', message);
export const notFound = (message = 'Not found') => new ApiError(404, 'not_found', message);
export const tooManyRequests = (message: string) => new ApiError(429, 'rate_limited', message);

const STATUS_FOR_RPC: Partial<Record<Status, [number, ProblemCode]>> = {
    [Status.INVALID_ARGUMENT]: [400, 'validation_failed'],
    [Status.OUT_OF_RANGE]: [400, 'validation_failed'],
    [Status.UNAUTHENTICATED]: [401, 'unauthenticated'],
    [Status.PERMISSION_DENIED]: [403, 'forbidden'],
    [Status.NOT_FOUND]: [404, 'not_found'],
    [Status.ALREADY_EXISTS]: [409, 'conflict'],
    [Status.FAILED_PRECONDITION]: [409, 'conflict'],
    [Status.ABORTED]: [409, 'conflict'],
    [Status.UNAVAILABLE]: [503, 'upstream_unavailable'],
    [Status.DEADLINE_EXCEEDED]: [504, 'upstream_timeout'],
};

export function toProblem(error: unknown): Problem {
    if (error instanceof ApiError) return problem(error.status, error.code, error.message, error.extra);

    const rpc = rpcErrorInfo(error);
    if (rpc) {
        if (rpc.status === Status.RESOURCE_EXHAUSTED) {
            if (rpc.meta['x-error-code'] === 'quota_exceeded') {
                return problem(402, 'quota_exceeded', rpc.details, {
                    metric: rpc.meta['x-quota-metric'],
                    used: Number(rpc.meta['x-quota-used'] ?? 0),
                    limit: Number(rpc.meta['x-quota-limit'] ?? 0),
                });
            }
            return problem(429, 'rate_limited', rpc.details);
        }
        const [status, code] = STATUS_FOR_RPC[rpc.status] ?? [500, 'internal'];
        return problem(status, code, status < 500 ? rpc.details : undefined);
    }
    return problem(500, 'internal');
}

export function sendProblem(res: Response, body: Problem): void {
    if (res.headersSent) {
        res.end();
        return;
    }
    res.status(body.status).type(PROBLEM_CONTENT_TYPE).json(body);
}
