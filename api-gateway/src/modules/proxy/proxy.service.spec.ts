import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { ProxyService } from './proxy.service';

beforeAll(() => {
    process.env.AUTH_SERVICE_URL = 'http://localhost:8001';
    process.env.UPLOAD_MANAGER_URL = 'http://localhost:8002';
    process.env.SCENE_DETECTOR_URL = 'http://localhost:8003';
    process.env.FILE_EMBEDDER_URL = 'http://localhost:8004';
    process.env.CHAT_MANAGER_URL = 'http://localhost:8005';
    process.env.PAYMENT_SERVICE_URL = 'http://localhost:8006';
});

function makeService(requestImpl?: jest.Mock): { service: ProxyService; mockHttpService: any } {
    const mockHttpService = { request: requestImpl ?? jest.fn() };
    const service = new ProxyService(mockHttpService as any);
    return { service, mockHttpService };
}

let loggerErrorSpy: jest.SpyInstance;

describe('ProxyService', () => {
    beforeAll(() => {
        loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    });
    afterAll(() => jest.restoreAllMocks());
    afterEach(() => jest.clearAllMocks());

    // ─── getServiceForRoute ───────────────────────────────────────────────────

    describe('TC-PS-01: Route matching exact path', () => {
        it('returns "auth-service" for /api/auth/login', () => {
            const { service } = makeService();
            expect(service.getServiceForRoute('/api/auth/login')).toBe('auth-service');
        });
    });

    describe('TC-PS-02: Route matching wildcard', () => {
        it('returns "upload-manager" for /api/upload/file.pdf', () => {
            const { service } = makeService();
            expect(service.getServiceForRoute('/api/upload/file.pdf')).toBe('upload-manager');
        });

        it('returns "upload-manager" for exact /api/upload', () => {
            const { service } = makeService();
            expect(service.getServiceForRoute('/api/upload')).toBe('upload-manager');
        });
    });

    describe('TC-PS-03: Route not found', () => {
        it('returns null for /api/unknown', () => {
            const { service } = makeService();
            expect(service.getServiceForRoute('/api/unknown')).toBeNull();
        });
    });

    // ─── sanitizeHeaders (tested via forwardRequest) ──────────────────────────

    describe('TC-PS-04: Header sanitization removes forbidden headers', () => {
        it('removes host, content-length, connection, accept-encoding but keeps x-custom', async () => {
            let capturedConfig: any;
            const mockRequest = jest.fn().mockImplementation((cfg) => {
                capturedConfig = cfg;
                return of({ status: 200, data: {}, headers: {} });
            });
            const { service } = makeService(mockRequest);

            const headers = {
                host: 'example.com',
                'content-length': '100',
                connection: 'keep-alive',
                'accept-encoding': 'gzip',
                'x-custom': 'keep-me',
            };

            await service.forwardRequest('auth-service', '/api/auth/me', 'GET', undefined, headers);

            expect(capturedConfig.headers).not.toHaveProperty('host');
            expect(capturedConfig.headers).not.toHaveProperty('content-length');
            expect(capturedConfig.headers).not.toHaveProperty('connection');
            expect(capturedConfig.headers).not.toHaveProperty('accept-encoding');
            expect(capturedConfig.headers['x-custom']).toBe('keep-me');
        });
    });

    describe('TC-PS-05: Header sanitization preserves allowed headers', () => {
        it('preserves x-user-id, x-correlation-id, authorization', async () => {
            let capturedConfig: any;
            const mockRequest = jest.fn().mockImplementation((cfg) => {
                capturedConfig = cfg;
                return of({ status: 200, data: {}, headers: {} });
            });
            const { service } = makeService(mockRequest);

            const headers = {
                'x-user-id': '1',
                'x-correlation-id': 'uuid-123',
                authorization: 'Bearer token',
            };

            await service.forwardRequest('auth-service', '/api/auth/me', 'GET', undefined, headers);

            expect(capturedConfig.headers['x-user-id']).toBe('1');
            expect(capturedConfig.headers['x-correlation-id']).toBe('uuid-123');
            expect(capturedConfig.headers['authorization']).toBe('Bearer token');
        });
    });

    describe('TC-PS-06: SSE detection', () => {
        it('uses responseType:stream and timeout:0 when accept includes text/event-stream', async () => {
            let capturedConfig: any;
            const mockRequest = jest.fn().mockImplementation((cfg) => {
                capturedConfig = cfg;
                return of({ status: 200, data: { pipe: jest.fn() }, headers: { 'content-type': 'text/event-stream' } });
            });
            const { service } = makeService(mockRequest);

            const headers = { accept: 'text/event-stream' };
            await service.forwardRequest('chat-manager', '/api/chat/stream', 'GET', undefined, headers);

            expect(capturedConfig.responseType).toBe('stream');
            expect(capturedConfig.timeout).toBe(0);
        });
    });

    describe('TC-PS-07: Multipart file upload', () => {
        it('calls httpService with FormData when files are provided', async () => {
            let capturedConfig: any;
            const mockRequest = jest.fn().mockImplementation((cfg) => {
                capturedConfig = cfg;
                return of({ status: 200, data: {}, headers: {} });
            });
            const { service } = makeService(mockRequest);

            const files = {
                doc: [
                    {
                        fieldname: 'doc',
                        buffer: Buffer.from('test content'),
                        originalname: 'a.pdf',
                        mimetype: 'application/pdf',
                    },
                ],
            };
            const body = { title: 'x' };

            await service.forwardRequest('upload-manager', '/api/upload', 'POST', body, {}, undefined, files);

            // FormData instance should be the request data
            const FormData = require('form-data');
            expect(capturedConfig.data).toBeInstanceOf(FormData);
        });
    });

    describe('TC-PS-08: Downstream 2xx response', () => {
        it('resolves with status, data, headers and isStream:false when downstream returns 200', async () => {
            const successResponse = { status: 200, data: { data: 'ok' }, headers: {} };
            const { service } = makeService(jest.fn().mockReturnValue(of(successResponse)));

            const result = await service.forwardRequest('auth-service', '/api/auth/me', 'GET', undefined, {});
            expect(result).toMatchObject({ status: 200, data: { data: 'ok' }, headers: {} });
            expect(result.isStream).toBe(false);
        });
    });

    describe('TC-PS-09: Downstream 4xx response', () => {
        it('resolves (does not throw) with {status:400, data:{error:"bad"}} when downstream returns 400', async () => {
            const badResponse = { status: 400, data: { error: 'bad' }, headers: {} };
            // validateStatus: () => true means 4xx is not an axios error — it resolves normally
            const { service } = makeService(jest.fn().mockReturnValue(of(badResponse)));

            const result = await service.forwardRequest('auth-service', '/api/auth/me', 'GET', undefined, {});
            expect(result.status).toBe(400);
            expect(result.data).toEqual({ error: 'bad' });
        });
    });

    describe('TC-PS-10: Downstream ECONNREFUSED', () => {
        it('throws HttpException(503) when ECONNREFUSED', async () => {
            const econnError = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
            const { service } = makeService(jest.fn().mockReturnValue(throwError(() => econnError)));

            await expect(
                service.forwardRequest('upload-manager', '/api/upload', 'POST', {}, {}),
            ).rejects.toMatchObject({
                status: HttpStatus.SERVICE_UNAVAILABLE,
            });
            expect(loggerErrorSpy).toHaveBeenCalled();
        });

        it('throws with message containing service name on ECONNREFUSED', async () => {
            const econnError = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
            const { service } = makeService(jest.fn().mockReturnValue(throwError(() => econnError)));

            await expect(
                service.forwardRequest('upload-manager', '/api/upload', 'POST', {}, {}),
            ).rejects.toThrow('upload-manager');
            expect(loggerErrorSpy).toHaveBeenCalled();
        });
    });

    describe('TC-PS-11: Per-service timeout for auth-service', () => {
        it('calls httpService with timeout 5000 for auth-service', async () => {
            let capturedConfig: any;
            const { service } = makeService(
                jest.fn().mockImplementation((cfg) => {
                    capturedConfig = cfg;
                    return of({ status: 200, data: {}, headers: {} });
                }),
            );

            await service.forwardRequest('auth-service', '/api/auth/me', 'GET', undefined, {});
            expect(capturedConfig.timeout).toBe(5_000);
        });
    });

    describe('TC-PS-12: Per-service timeout for upload-manager', () => {
        it('calls httpService with timeout 120000 for upload-manager', async () => {
            let capturedConfig: any;
            const { service } = makeService(
                jest.fn().mockImplementation((cfg) => {
                    capturedConfig = cfg;
                    return of({ status: 200, data: {}, headers: {} });
                }),
            );

            await service.forwardRequest('upload-manager', '/api/upload', 'POST', {}, {});
            expect(capturedConfig.timeout).toBe(120_000);
        });
    });

    describe('forwardRequest: unknown service', () => {
        it('throws HttpException(404) when serviceName is not registered', async () => {
            const { service } = makeService();
            await expect(
                service.forwardRequest('nonexistent-service', '/api/foo', 'GET', undefined, {}),
            ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
        });
    });
});
