import { ClientError, ServerError, Status } from 'nice-grpc';

export const ERROR_CODE_KEY = 'x-error-code';

export class RpcError extends ServerError {
  constructor(
    code: Status,
    readonly reason: string,
    details: string,
    readonly meta: Record<string, string> = {},
  ) {
    super(code, details);
  }
}

export const invalidArgument = (details: string) =>
  new RpcError(Status.INVALID_ARGUMENT, 'validation_failed', details);

export const unauthenticated = (details = 'Not authenticated') =>
  new RpcError(Status.UNAUTHENTICATED, 'unauthenticated', details);

export const permissionDenied = (details: string) =>
  new RpcError(Status.PERMISSION_DENIED, 'forbidden', details);

export const notFound = (resource: string) =>
  new RpcError(Status.NOT_FOUND, 'not_found', `${resource} not found`);

export const alreadyExists = (details: string) =>
  new RpcError(Status.ALREADY_EXISTS, 'conflict', details);

export const failedPrecondition = (details: string) =>
  new RpcError(Status.FAILED_PRECONDITION, 'conflict', details);

export const unavailable = (details: string) =>
  new RpcError(Status.UNAVAILABLE, 'upstream_unavailable', details);

export const quotaExceeded = (metric: string, used: number, limit: number, details: string) =>
  new RpcError(Status.RESOURCE_EXHAUSTED, 'quota_exceeded', details, {
    'x-quota-metric': metric,
    'x-quota-used': String(used),
    'x-quota-limit': String(limit),
  });

export interface RpcErrorInfo {
  status: Status;
  details: string;
  meta: Record<string, string>;
}

export function rpcErrorInfo(error: unknown): RpcErrorInfo | undefined {
  if (!(error instanceof ClientError)) return undefined;
  return {
    status: error.code,
    details: error.details,
    meta: (error as ClientError & { meta?: Record<string, string> }).meta ?? {},
  };
}

export { ClientError, ServerError, Status };
