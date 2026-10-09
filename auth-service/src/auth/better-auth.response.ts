import { HttpException, HttpStatus } from '@nestjs/common';
import type { Response as ExpressResponse } from 'express';

interface BetterAuthError {
    code?: string;
    message?: string;
}

const CONFLICT_CODES = new Set(['USER_ALREADY_EXISTS', 'USERNAME_IS_ALREADY_TAKEN']);

export function copyCookies(from: Response, to: ExpressResponse): void {
    const cookies = from.headers.getSetCookie();
    if (cookies.length > 0) to.append('Set-Cookie', cookies);
}

export async function ensureOk(response: Response): Promise<void> {
    if (response.ok || (response.status >= 300 && response.status < 400)) return;
    const error = (await response.json().catch(() => ({}))) as BetterAuthError;
    const status = CONFLICT_CODES.has(error.code ?? '') ? HttpStatus.CONFLICT : response.status;
    throw new HttpException(error.message || response.statusText, status);
}

export async function readJson<T>(response: Response): Promise<T> {
    return (await response.json()) as T;
}
