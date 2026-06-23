import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

function buildContext(headers: Record<string, string> = {}): ExecutionContext {
    const mockRequest: Record<string, any> = { headers };
    return {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: () => ({
            getRequest: () => mockRequest,
        }),
    } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
    let guard: AuthGuard;
    let reflector: { getAllAndOverride: jest.Mock };

    beforeEach(() => {
        reflector = { getAllAndOverride: jest.fn() };
        guard = new AuthGuard(reflector as unknown as Reflector);
    });

    afterEach(() => jest.clearAllMocks());

    describe('public routes', () => {
        it('returns true without inspecting headers', () => {
            reflector.getAllAndOverride.mockReturnValue(true);
            const ctx = buildContext();

            const result = guard.canActivate(ctx);

            expect(result).toBe(true);
            expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
                ctx.getHandler(),
                ctx.getClass(),
            ]);
        });
    });

    describe('protected routes', () => {
        beforeEach(() => {
            reflector.getAllAndOverride.mockReturnValue(false);
        });

        it('returns true and populates req.user and req.session with valid headers', () => {
            const user = { id: 'user-1', email: 'a@b.com' };
            const session = { id: 'session-1' };
            const mockRequest: Record<string, any> = {
                headers: {
                    'x-user': JSON.stringify(user),
                    'x-session': JSON.stringify(session),
                },
            };
            const ctx = {
                getHandler: jest.fn(),
                getClass: jest.fn(),
                switchToHttp: () => ({ getRequest: () => mockRequest }),
            } as unknown as ExecutionContext;

            const result = guard.canActivate(ctx);

            expect(result).toBe(true);
            expect(mockRequest['user']).toEqual(user);
            expect(mockRequest['session']).toEqual(session);
        });

        it('throws UnauthorizedException when x-user header contains invalid JSON', () => {
            const ctx = buildContext({
                'x-user': '{invalid-json',
                'x-session': '{}',
            });

            expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
        });

        it('throws UnauthorizedException when both auth headers are absent', () => {
            const ctx = buildContext({});

            expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
        });

        it('throws UnauthorizedException when only x-user is present without x-session', () => {
            const ctx = buildContext({ 'x-user': JSON.stringify({ id: 'u1' }) });

            expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
        });
    });
});
