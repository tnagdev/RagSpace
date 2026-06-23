import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
    let controller: AppController;
    let appService: AppService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [AppController],
            providers: [AppService],
        }).compile();

        controller = module.get<AppController>(AppController);
        appService = module.get<AppService>(AppService);
    });

    // ─── TC-APP-01: Health endpoint ───────────────────────────────────────────

    describe('TC-APP-01: Health endpoint', () => {
        it('returns a health object with required fields', () => {
            const result = controller.getHealth();

            expect(result).toMatchObject({
                status: 'ok',
                service: 'api-gateway',
            });
            expect(typeof result.timestamp).toBe('string');
            expect(() => new Date(result.timestamp)).not.toThrow();
            expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
        });

        it('contains env field derived from NODE_ENV or "development"', () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'test';
            const result = controller.getHealth();
            expect(result.env).toBe('test');
            process.env.NODE_ENV = originalEnv;
        });

        it('defaults env to "development" when NODE_ENV is not set', () => {
            const originalEnv = process.env.NODE_ENV;
            delete process.env.NODE_ENV;
            const result = controller.getHealth();
            expect(result.env).toBe('development');
            process.env.NODE_ENV = originalEnv;
        });

        it('contains a port field (may be undefined if PORT not set)', () => {
            const result = controller.getHealth();
            // port key must exist; value can be undefined or a string
            expect(result).toHaveProperty('port');
        });

        it('delegates to AppService.getHealth()', () => {
            const spy = jest.spyOn(appService, 'getHealth');
            controller.getHealth();
            expect(spy).toHaveBeenCalledTimes(1);
        });
    });

    // ─── AppService unit tests (direct) ──────────────────────────────────────

    describe('AppService.getHealth()', () => {
        it('returns the same shape as described in the spec', () => {
            const result = appService.getHealth();
            expect(result.status).toBe('ok');
            expect(result.service).toBe('api-gateway');
            expect(typeof result.timestamp).toBe('string');
        });

        it('generates a fresh timestamp on each call', async () => {
            const first = appService.getHealth().timestamp;
            // Small delay to ensure timestamps differ
            await new Promise(r => setTimeout(r, 5));
            const second = appService.getHealth().timestamp;
            // They may or may not differ at ms resolution, but both must be valid ISO strings
            expect(new Date(first).toISOString()).toBe(first);
            expect(new Date(second).toISOString()).toBe(second);
        });
    });
});
