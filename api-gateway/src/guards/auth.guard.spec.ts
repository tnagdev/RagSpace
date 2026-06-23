import { ExecutionContext, Logger, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of, throwError } from 'rxjs';
import { AuthGuard } from './auth.guard';

// Set env before importing anything that reads it at module-level
beforeAll(() => {
    process.env.AUTH_SERVICE_URL = 'http://localhost:8001';
});

function makeContext(
    path: string,
    headers: Record<string, string> = {},
    isPublicOverride?: boolean,
): { context: ExecutionContext; request: any } {
    const request: any = { path, headers, user: undefined, session: undefined };
    const context = {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => ({}),
        getClass: () => ({}),
    } as unknown as ExecutionContext;
    return { context, request };
}

function makeGuard(
    httpGetImpl?: jest.Mock,
    reflectorOverride?: boolean,
): { guard: AuthGuard; mockHttpService: any; mockReflector: any } {
    const mockHttpService = { get: httpGetImpl ?? jest.fn() };
    const mockReflector = {
        getAllAndOverride: jest.fn().mockReturnValue(reflectorOverride ?? false),
    };
    const mockConfigService = {
        get: jest.fn().mockReturnValue('http://localhost:8001'),
    };
    const guard = new AuthGuard(mockHttpService as any, mockReflector as any, mockConfigService as any);
    return { guard, mockHttpService, mockReflector };
}

let loggerErrorSpy: jest.SpyInstance;

describe('AuthGuard', () => {
    beforeAll(() => {
        loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    });
    afterAll(() => jest.restoreAllMocks());
    afterEach(() => jest.clearAllMocks());

    describe('TC-AG-01: Public exact path bypass', () => {
        it('returns true for /api/auth/signin without calling httpService', async () => {
            const { guard, mockHttpService } = makeGuard();
            const { context } = makeContext('/api/auth/signin');
            const result = await guard.canActivate(context);
            expect(result).toBe(true);
            expect(mockHttpService.get).not.toHaveBeenCalled();
        });

        it.each([
            '/api/auth/signup',
            '/api/auth/google',
            '/api/auth/google/login',
            '/api/auth/google/callback',
            '/api/auth/session',
            '/api/auth/health',
            '/api/auth/forget-password',
            '/api/auth/forgot-password',
            '/api/webhooks/lemon-squeezy',
            '/api/webhooks/razorpay',
            '/webhooks/lemon-squeezy',
            '/webhooks/razorpay',
        ])('returns true for public exact path %s', async (path) => {
            const { guard, mockHttpService } = makeGuard();
            const { context } = makeContext(path);
            const result = await guard.canActivate(context);
            expect(result).toBe(true);
            expect(mockHttpService.get).not.toHaveBeenCalled();
        });
    });

    describe('TC-AG-02: Public prefix path bypass', () => {
        it('returns true for /api/plans/monthly without calling httpService', async () => {
            const { guard, mockHttpService } = makeGuard();
            const { context } = makeContext('/api/plans/monthly');
            const result = await guard.canActivate(context);
            expect(result).toBe(true);
            expect(mockHttpService.get).not.toHaveBeenCalled();
        });

        it('returns true for /api/auth/reset-password/token123 without calling httpService', async () => {
            const { guard, mockHttpService } = makeGuard();
            const { context } = makeContext('/api/auth/reset-password/token123');
            const result = await guard.canActivate(context);
            expect(result).toBe(true);
            expect(mockHttpService.get).not.toHaveBeenCalled();
        });
    });

    describe('TC-AG-03: @Public() decorator bypass', () => {
        it('returns true when reflector indicates @Public() without calling httpService', async () => {
            const { guard, mockHttpService } = makeGuard(jest.fn(), true);
            const { context } = makeContext('/api/protected/resource');
            const result = await guard.canActivate(context);
            expect(result).toBe(true);
            expect(mockHttpService.get).not.toHaveBeenCalled();
        });
    });

    describe('TC-AG-04: Cache hit within TTL', () => {
        it('returns cached user/session without calling httpService when cache is valid', async () => {
            const mockGet = jest.fn().mockReturnValue(
                of({ data: { user: { id: '1', email: 'first@x.com' }, session: { token: 'first' } } }),
            );
            const { guard, mockHttpService } = makeGuard(mockGet);

            const { context: ctx1, request: req1 } = makeContext('/api/protected', { cookie: 'sid=abc' });
            await guard.canActivate(ctx1);
            expect(mockHttpService.get).toHaveBeenCalledTimes(1);

            // Second call — same cookie, within TTL
            const { context: ctx2, request: req2 } = makeContext('/api/protected', { cookie: 'sid=abc' });
            const result = await guard.canActivate(ctx2);

            expect(result).toBe(true);
            expect(mockHttpService.get).toHaveBeenCalledTimes(1); // still only 1
            expect(req2.user).toEqual({ id: '1', email: 'first@x.com' });
            expect(req2.session).toEqual({ token: 'first' });
        });
    });

    describe('TC-AG-05: Cache miss due to expiry', () => {
        it('deletes expired entry and calls httpService again', async () => {
            const sessionData = { user: { id: '2', email: 'b@x.com' }, session: { token: 'xyz' } };
            const mockGet = jest.fn().mockReturnValue(of({ data: sessionData }));
            const { guard, mockHttpService } = makeGuard(mockGet);

            // Manually insert expired cache entry
            const cacheKey = 'sid=expired';
            (guard as any).sessionCache.set(cacheKey, {
                user: { id: 'old' },
                session: { token: 'old' },
                expiresAt: Date.now() - 1000,
            });

            const { context, request } = makeContext('/api/protected', { cookie: cacheKey });
            const result = await guard.canActivate(context);

            expect(result).toBe(true);
            expect(mockHttpService.get).toHaveBeenCalledTimes(1);
            expect(request.user).toEqual(sessionData.user);
            expect(request.session).toEqual(sessionData.session);
            // The expired key was deleted and replaced with a fresh cache entry
            const freshEntry = (guard as any).sessionCache.get(cacheKey);
            expect(freshEntry).toBeDefined();
            expect(freshEntry.expiresAt).toBeGreaterThan(Date.now());
        });
    });

    describe('TC-AG-06: Successful auth from service', () => {
        it('returns true and sets req.user/session from auth-service response', async () => {
            const sessionData = { user: { id: '1', email: 'test@x.com' }, session: { token: 'abc' } };
            const mockGet = jest.fn().mockReturnValue(of({ data: sessionData }));
            const { guard } = makeGuard(mockGet);

            const { context, request } = makeContext('/api/protected', { cookie: 'sid=fresh' });
            const result = await guard.canActivate(context);

            expect(result).toBe(true);
            expect(request.user).toEqual(sessionData.user);
            expect(request.session).toEqual(sessionData.session);
            expect(mockGet).toHaveBeenCalledWith(
                'http://localhost:8001/auth/session',
                expect.objectContaining({ timeout: 5000 }),
            );
        });
    });

    describe('TC-AG-07: Auth-service returns 401', () => {
        it('throws UnauthorizedException with "Invalid or expired session"', async () => {
            const error401 = { response: { status: 401, data: 'Unauthorized' } };
            const mockGet = jest.fn().mockReturnValue(throwError(() => error401));
            const { guard } = makeGuard(mockGet);

            const { context } = makeContext('/api/protected', { cookie: 'sid=bad' });
            await expect(guard.canActivate(context)).rejects.toThrow(
                new UnauthorizedException('Invalid or expired session'),
            );
            expect(loggerErrorSpy).toHaveBeenCalled();
        });
    });

    describe('TC-AG-08: Auth-service ECONNREFUSED', () => {
        it('throws UnauthorizedException with "Authentication service unavailable"', async () => {
            const econnError = { code: 'ECONNREFUSED' };
            const mockGet = jest.fn().mockReturnValue(throwError(() => econnError));
            const { guard } = makeGuard(mockGet);

            const { context } = makeContext('/api/protected', { cookie: 'sid=any' });
            await expect(guard.canActivate(context)).rejects.toThrow(
                new UnauthorizedException('Authentication service unavailable'),
            );
            expect(loggerErrorSpy).toHaveBeenCalled();
        });
    });

    describe('TC-AG-09: Malformed auth response', () => {
        it('throws UnauthorizedException("No authentication provided") when user/session are null', async () => {
            const mockGet = jest.fn().mockReturnValue(
                of({ data: { user: null, session: null } }),
            );
            const { guard } = makeGuard(mockGet);

            const { context } = makeContext('/api/protected', { cookie: 'sid=malformed' });
            await expect(guard.canActivate(context)).rejects.toThrow(
                new UnauthorizedException('No authentication provided'),
            );
            expect(loggerErrorSpy).toHaveBeenCalled();
        });

        it('throws UnauthorizedException("No authentication provided") when data is empty object', async () => {
            const mockGet = jest.fn().mockReturnValue(of({ data: {} }));
            const { guard } = makeGuard(mockGet);

            const { context } = makeContext('/api/protected', { cookie: 'sid=empty' });
            await expect(guard.canActivate(context)).rejects.toThrow(
                new UnauthorizedException('No authentication provided'),
            );
            expect(loggerErrorSpy).toHaveBeenCalled();
        });
    });

    describe('TC-AG-10: Cache cleanup at 5000 entries', () => {
        it('deletes expired entries when cache exceeds 5000', async () => {
            const sessionData = { user: { id: 'fresh' }, session: { token: 't' } };
            const mockGet = jest.fn().mockReturnValue(of({ data: sessionData }));
            const { guard } = makeGuard(mockGet);

            const cache: Map<string, any> = (guard as any).sessionCache;

            // Fill cache with 5001 expired entries
            for (let i = 0; i < 5001; i++) {
                cache.set(`stale-key-${i}`, {
                    user: {},
                    session: {},
                    expiresAt: Date.now() - 1000,
                });
            }

            const uniqueCookie = 'sid=trigger-cleanup';
            const { context } = makeContext('/api/protected', { cookie: uniqueCookie });
            await guard.canActivate(context);

            // All 5001 expired entries should have been cleaned
            for (let i = 0; i < 5001; i++) {
                expect(cache.has(`stale-key-${i}`)).toBe(false);
            }
            // Only the fresh entry for uniqueCookie should remain
            expect(cache.has(uniqueCookie)).toBe(true);
        });
    });

    describe('TC-AG-11: No cookie header', () => {
        it('calls auth-service with empty cookie string when request has no cookie', async () => {
            const sessionData = { user: { id: '1' }, session: { token: 'tok' } };
            const mockGet = jest.fn().mockReturnValue(of({ data: sessionData }));
            const { guard } = makeGuard(mockGet);

            const { context } = makeContext('/api/protected', {}); // no cookie
            const result = await guard.canActivate(context);

            expect(result).toBe(true);
            expect(mockGet).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    headers: expect.objectContaining({ cookie: '' }),
                }),
            );
        });
    });
});
