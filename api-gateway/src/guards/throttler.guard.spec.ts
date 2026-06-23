import { ExecutionContext } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { CustomThrottlerGuard } from './throttler.guard';

// ThrottlerGuard requires a throttler storage; we only test the two overridden methods
// so we instantiate the class with no-op constructor args via casting.
function makeGuard(): CustomThrottlerGuard {
    // Bypass the parent constructor by calling Object.create and then assigning
    // the prototype — avoids DI requirement for ThrottlerStorage.
    const guard = Object.create(CustomThrottlerGuard.prototype) as CustomThrottlerGuard;
    return guard;
}

describe('CustomThrottlerGuard', () => {
    describe('TC-CTG-01: Tracker uses user ID', () => {
        it('returns user.id when user is present', async () => {
            const guard = makeGuard();
            const req = { user: { id: 'u1' }, ip: '1.2.3.4' };
            const tracker = await (guard as any).getTracker(req);
            expect(tracker).toBe('u1');
        });
    });

    describe('TC-CTG-02: Tracker falls back to IP', () => {
        it('returns ip when user is undefined', async () => {
            const guard = makeGuard();
            const req = { user: undefined, ip: '1.2.3.4' };
            const tracker = await (guard as any).getTracker(req);
            expect(tracker).toBe('1.2.3.4');
        });

        it('returns ip when user has no id', async () => {
            const guard = makeGuard();
            const req = { user: {}, ip: '5.6.7.8' };
            const tracker = await (guard as any).getTracker(req);
            expect(tracker).toBe('5.6.7.8');
        });
    });

    describe('throwThrottlingException', () => {
        it('throws ThrottlerException with correct message', async () => {
            const guard = makeGuard();
            const mockContext = {} as ExecutionContext;
            await expect(
                (guard as any).throwThrottlingException(mockContext),
            ).rejects.toThrow(new ThrottlerException('Too many requests. Please try again later.'));
        });
    });
});
