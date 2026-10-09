import type { NextFunction, Request, Response } from 'express';
import { RateLimiter } from './rate-limit';

function call(limiter: RateLimiter, method: string, path: string, cookie?: string) {
    const headers: Record<string, unknown> = {};
    let status = 200;
    const res = {
        headersSent: false,
        setHeader: (name: string, value: unknown) => (headers[name] = value),
        status(code: number) {
            status = code;
            return this;
        },
        type() {
            return this;
        },
        json() {
            return this;
        },
    } as unknown as Response;
    const next = jest.fn() as NextFunction;
    limiter.middleware({ method, path, ip: '1.2.3.4', headers: { cookie } } as unknown as Request, res, next);
    return { headers, status, passed: (next as jest.Mock).mock.calls.length === 1 };
}

describe('RateLimiter', () => {
    let now = 0;
    const limiter = () =>
        new RateLimiter(
            [{ name: 'sign-in', method: 'POST', path: /^\/auth\/sign-in$/, limit: 2, windowMs: 60_000, perIp: true }],
            { name: 'global', limit: 3, windowMs: 60_000 },
            () => now,
        );

    beforeEach(() => (now = 0));

    it('reports the specific rule and blocks past its limit', () => {
        const instance = limiter();
        expect(call(instance, 'POST', '/auth/sign-in').headers['RateLimit-Limit']).toBe(2);
        call(instance, 'POST', '/auth/sign-in');
        const blocked = call(instance, 'POST', '/auth/sign-in');
        expect(blocked.passed).toBe(false);
        expect(blocked.status).toBe(429);
        expect(blocked.headers['Retry-After']).toBe(60);
    });

    it('applies the global limit per session and resets after the window', () => {
        const instance = limiter();
        for (let i = 0; i < 3; i++) expect(call(instance, 'GET', '/files', 'better-auth.session_token=abc').passed).toBe(true);
        expect(call(instance, 'GET', '/files', 'better-auth.session_token=abc').passed).toBe(false);
        expect(call(instance, 'GET', '/files', 'better-auth.session_token=other').passed).toBe(true);
        now = 60_001;
        expect(call(instance, 'GET', '/files', 'better-auth.session_token=abc').passed).toBe(true);
    });
});
