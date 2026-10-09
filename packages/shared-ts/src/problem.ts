import { currentCorrelationId } from './context';

export type ProblemCode =
  | 'validation_failed'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'quota_exceeded'
  | 'rate_limited'
  | 'upstream_unavailable'
  | 'upstream_timeout'
  | 'internal';

export interface FieldError {
  field: string;
  message: string;
}

export interface Problem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  code: ProblemCode;
  correlationId: string;
  errors?: FieldError[];
  metric?: string;
  used?: number;
  limit?: number;
}

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

const TITLES: Record<ProblemCode, string> = {
  validation_failed: 'Validation failed',
  unauthenticated: 'Unauthenticated',
  forbidden: 'Forbidden',
  not_found: 'Not found',
  conflict: 'Conflict',
  quota_exceeded: 'Quota exceeded',
  rate_limited: 'Too many requests',
  upstream_unavailable: 'Service unavailable',
  upstream_timeout: 'Service timeout',
  internal: 'Internal error',
};

const CODES_BY_STATUS: Record<number, ProblemCode> = {
  400: 'validation_failed',
  401: 'unauthenticated',
  402: 'quota_exceeded',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  413: 'validation_failed',
  415: 'validation_failed',
  422: 'validation_failed',
  429: 'rate_limited',
  503: 'upstream_unavailable',
  504: 'upstream_timeout',
};

export function problemCodeForStatus(status: number): ProblemCode {
  return CODES_BY_STATUS[status] ?? (status >= 500 ? 'internal' : 'validation_failed');
}

export function problem(
  status: number,
  code: ProblemCode = problemCodeForStatus(status),
  detail?: string,
  extra: Pick<Problem, 'errors' | 'metric' | 'used' | 'limit'> = {},
): Problem {
  return {
    type: `https://docs.ragspace.app/errors/${code}`,
    title: TITLES[code],
    status,
    ...(detail ? { detail } : {}),
    code,
    correlationId: currentCorrelationId() ?? '',
    ...extra,
  };
}
