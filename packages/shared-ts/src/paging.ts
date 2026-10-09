import { invalidArgument } from './grpc/errors';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const MAX_BATCH_IDS = 100;

export function clampPageSize(requested: number | undefined, fallback = DEFAULT_PAGE_SIZE, max = MAX_PAGE_SIZE): number {
  if (!requested || requested < 1) return fallback;
  return Math.min(requested, max);
}

export function encodePageToken(cursor: Record<string, string | number>): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

export function decodePageToken<T extends Record<string, string | number>>(token: string | undefined): T | undefined {
  if (!token) return undefined;
  try {
    return JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as T;
  } catch {
    throw invalidArgument('Invalid page token');
  }
}

export function assertBatchSize(ids: readonly string[], field = 'ids', max = MAX_BATCH_IDS): void {
  if (ids.length > max) throw invalidArgument(`${field} accepts at most ${max} values`);
}
