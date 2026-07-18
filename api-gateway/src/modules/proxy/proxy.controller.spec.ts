import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ProxyController } from './proxy.controller';
import { ProxyService } from './proxy.service';

function makeMockRes() {
    const res: any = {
        json: jest.fn(),
        status: jest.fn(),
        send: jest.fn(),
        setHeader: jest.fn(),
        redirect: jest.fn(),
    };
    // Chain every method so res.status(x).send(y) works
    res.json.mockReturnValue(res);
    res.status.mockReturnValue(res);
    res.send.mockReturnValue(res);
    res.setHeader.mockReturnValue(res);
    res.redirect.mockReturnValue(res);
    return res;
}

function makeMockReq(overrides: Partial<{
    path: string;
    method: string;
    headers: Record<string, any>;
    body: any;
    query: any;
    user: any;
    session: any;
}> = {}): any {
    return {
        path: '/api/chat/start',
        method: 'GET',
        headers: {},
        body: {},
        query: {},
        user: undefined,
        session: undefined,
        ...overrides,
    };
}

describe('ProxyController', () => {
    let controller: ProxyController;
    let mockProxyService: { getServiceForRoute: jest.Mock; forwardRequest: jest.Mock };

    beforeEach(async () => {
        mockProxyService = {
            getServiceForRoute: jest.fn().mockReturnValue('chat-manager'),
            forwardRequest: jest.fn().mockResolvedValue({ status: 200, data: {}, headers: {}, isStream: false }),
        };

        const module: TestingModule = await Test.createTestingModule({
            controllers: [ProxyController],
            providers: [{ provide: ProxyService, useValue: mockProxyService }],
        }).compile();

        controller = module.get<ProxyController>(ProxyController);
    });

    // ─── Health shortcut ──────────────────────────────────────────────────────

    it('returns health JSON directly without calling proxyService', async () => {
        const req = makeMockReq({ path: '/api/health' });
        const res = makeMockRes();
        await controller.handleRequest(req, res, []);
        expect(res.json).toHaveBeenCalledWith({ status: 'ok' });
        expect(mockProxyService.getServiceForRoute).not.toHaveBeenCalled();
    });

    it('also handles /api/health/deep as health shortcut', async () => {
        const req = makeMockReq({ path: '/api/health/deep' });
        const res = makeMockRes();
        await controller.handleRequest(req, res, []);
        expect(res.json).toHaveBeenCalledWith({ status: 'ok' });
    });

    // ─── 404 when no service found ────────────────────────────────────────────

    it('throws HttpException(404) when no service is configured for the route', async () => {
        mockProxyService.getServiceForRoute.mockReturnValue(null);
        const req = makeMockReq({ path: '/api/unknown/route' });
        const res = makeMockRes();

        await expect(controller.handleRequest(req, res, [])).rejects.toThrow(HttpException);
    });

    // ─── TC-PC-01: Generate UUID correlation ID ───────────────────────────────

    describe('TC-PC-01: Generate UUID correlation ID', () => {
        it('generates x-correlation-id when not present in request headers', async () => {
            const req = makeMockReq({ headers: {} });
            const res = makeMockRes();
            mockProxyService.forwardRequest.mockResolvedValue({ status: 200, data: {}, headers: {}, isStream: false });

            await controller.handleRequest(req, res, []);

            // The correlation ID should be forwarded to the downstream service
            const [, , , , enrichedHeaders] = mockProxyService.forwardRequest.mock.calls[0];
            expect(enrichedHeaders['x-correlation-id']).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
            );
            // And set on the response
            expect(res.setHeader).toHaveBeenCalledWith('x-correlation-id', expect.any(String));
        });
    });

    // ─── TC-PC-02: Forward existing correlation ID ───────────────────────────

    describe('TC-PC-02: Forward existing correlation ID', () => {
        it('forwards the existing x-correlation-id as-is', async () => {
            const req = makeMockReq({ headers: { 'x-correlation-id': 'abc-123' } });
            const res = makeMockRes();
            mockProxyService.forwardRequest.mockResolvedValue({ status: 200, data: {}, headers: {}, isStream: false });

            await controller.handleRequest(req, res, []);

            const [, , , , enrichedHeaders] = mockProxyService.forwardRequest.mock.calls[0];
            expect(enrichedHeaders['x-correlation-id']).toBe('abc-123');
            expect(res.setHeader).toHaveBeenCalledWith('x-correlation-id', 'abc-123');
        });
    });

    // ─── TC-PC-03: Inject user context headers ───────────────────────────────

    describe('TC-PC-03: Inject user context headers', () => {
        it('sets x-user-id, x-user-email, x-user-name, x-user from req.user', async () => {
            const user = { id: 'u1', email: 'test@x.com', name: 'Alice' };
            const req = makeMockReq({ user });
            const res = makeMockRes();
            mockProxyService.forwardRequest.mockResolvedValue({ status: 200, data: {}, headers: {}, isStream: false });

            await controller.handleRequest(req, res, []);

            const [, , , , enrichedHeaders] = mockProxyService.forwardRequest.mock.calls[0];
            expect(enrichedHeaders['x-user-id']).toBe('u1');
            expect(enrichedHeaders['x-user-email']).toBe('test@x.com');
            expect(enrichedHeaders['x-user-name']).toBe('Alice');
            expect(enrichedHeaders['x-user']).toBe(JSON.stringify(user));
        });
    });

    // ─── TC-PC-04: Username fallback ─────────────────────────────────────────

    describe('TC-PC-04: Username fallback', () => {
        it('falls back to username when name is not present', async () => {
            const user = { id: 'u1', email: 'test@x.com', username: 'alice_user' };
            const req = makeMockReq({ user });
            const res = makeMockRes();
            mockProxyService.forwardRequest.mockResolvedValue({ status: 200, data: {}, headers: {}, isStream: false });

            await controller.handleRequest(req, res, []);

            const [, , , , enrichedHeaders] = mockProxyService.forwardRequest.mock.calls[0];
            expect(enrichedHeaders['x-user-name']).toBe('alice_user');
        });
    });

    // ─── TC-PC-05: Inject x-session ──────────────────────────────────────────

    describe('TC-PC-05: Inject x-session', () => {
        it('sets x-session from req.session as JSON string', async () => {
            const session = { token: 'xyz' };
            const req = makeMockReq({ session });
            const res = makeMockRes();
            mockProxyService.forwardRequest.mockResolvedValue({ status: 200, data: {}, headers: {}, isStream: false });

            await controller.handleRequest(req, res, []);

            const [, , , , enrichedHeaders] = mockProxyService.forwardRequest.mock.calls[0];
            expect(enrichedHeaders['x-session']).toBe(JSON.stringify(session));
        });
    });

    // ─── TC-PC-06: No user context if unauthenticated ────────────────────────

    describe('TC-PC-06: No user context if unauthenticated', () => {
        it('does NOT set x-user-* headers when req.user is undefined', async () => {
            const req = makeMockReq({ user: undefined });
            const res = makeMockRes();
            mockProxyService.forwardRequest.mockResolvedValue({ status: 200, data: {}, headers: {}, isStream: false });

            await controller.handleRequest(req, res, []);

            const [, , , , enrichedHeaders] = mockProxyService.forwardRequest.mock.calls[0];
            expect(enrichedHeaders).not.toHaveProperty('x-user-id');
            expect(enrichedHeaders).not.toHaveProperty('x-user-email');
            expect(enrichedHeaders).not.toHaveProperty('x-user-name');
            expect(enrichedHeaders).not.toHaveProperty('x-user');
        });
    });

    // ─── TC-PC-07: SSE stream piping ─────────────────────────────────────────

    describe('TC-PC-07: SSE stream piping', () => {
        it('pipes result.data to res when content-type is text/event-stream', async () => {
            const mockPipe = jest.fn();
            const streamResult = {
                status: 200,
                headers: {},
                data: { pipe: mockPipe },
                isStream: true,
            };
            mockProxyService.forwardRequest.mockResolvedValue(streamResult);

            const req = makeMockReq();
            const res = makeMockRes();

            await controller.handleRequest(req, res, []);

            expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
            expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
            expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
            expect(res.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
            expect(mockPipe).toHaveBeenCalledWith(res);
        });
    });

    // ─── TC-PC-08: Regular JSON response ─────────────────────────────────────

    describe('TC-PC-08: Regular JSON response', () => {
        it('sends data with correct status for a regular 200 response', async () => {
            const jsonResult = { status: 200, data: { data: 'ok' }, headers: {} };
            mockProxyService.forwardRequest.mockResolvedValue(jsonResult);

            const req = makeMockReq();
            const res = makeMockRes();

            await controller.handleRequest(req, res, []);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.send).toHaveBeenCalledWith({ data: 'ok' });
        });
    });

    // ─── TC-PC-09: Redirect response ─────────────────────────────────────────

    describe('TC-PC-09: Redirect response', () => {
        it('calls res.redirect(302) when result.data has redirect:true and url', async () => {
            const redirectResult = {
                status: 302,
                data: { redirect: true, url: '/auth/login' },
                headers: {},
            };
            mockProxyService.forwardRequest.mockResolvedValue(redirectResult);

            const req = makeMockReq();
            const res = makeMockRes();

            await controller.handleRequest(req, res, []);

            expect(res.redirect).toHaveBeenCalledWith(302, '/auth/login');
        });
    });

    // ─── TC-PC-10: Set-Cookie single value ───────────────────────────────────

    describe('TC-PC-10: Set-Cookie single string value', () => {
        it('wraps single set-cookie string in an array', async () => {
            const cookieResult = {
                status: 200,
                data: {},
                headers: { 'set-cookie': 'sid=abc; Path=/' },
            };
            mockProxyService.forwardRequest.mockResolvedValue(cookieResult);

            const req = makeMockReq();
            const res = makeMockRes();

            await controller.handleRequest(req, res, []);

            expect(res.setHeader).toHaveBeenCalledWith('set-cookie', ['sid=abc; Path=/']);
        });
    });

    // ─── TC-PC-11: Set-Cookie multiple values ────────────────────────────────

    describe('TC-PC-11: Set-Cookie multiple values', () => {
        it('passes array of cookies through unchanged', async () => {
            const cookieResult = {
                status: 200,
                data: {},
                headers: { 'set-cookie': ['sid=abc', 'other=xyz'] },
            };
            mockProxyService.forwardRequest.mockResolvedValue(cookieResult);

            const req = makeMockReq();
            const res = makeMockRes();

            await controller.handleRequest(req, res, []);

            expect(res.setHeader).toHaveBeenCalledWith('set-cookie', ['sid=abc', 'other=xyz']);
        });
    });

    // ─── Header forwarding edge cases ─────────────────────────────────────────

    describe('Header forwarding', () => {
        it('does not forward transfer-encoding header', async () => {
            const result = {
                status: 200,
                data: {},
                headers: { 'transfer-encoding': 'chunked', 'x-keep': 'yes' },
            };
            mockProxyService.forwardRequest.mockResolvedValue(result);

            const req = makeMockReq();
            const res = makeMockRes();

            await controller.handleRequest(req, res, []);

            // x-keep should be forwarded; transfer-encoding should not
            const allSetHeaderCalls: string[][] = res.setHeader.mock.calls;
            const headerNames = allSetHeaderCalls.map(([name]) => name.toLowerCase());
            expect(headerNames).not.toContain('transfer-encoding');
            expect(headerNames).toContain('x-keep');
        });

        it('does not forward content-encoding header', async () => {
            const result = {
                status: 200,
                data: {},
                headers: { 'content-encoding': 'gzip' },
            };
            mockProxyService.forwardRequest.mockResolvedValue(result);

            const req = makeMockReq();
            const res = makeMockRes();

            await controller.handleRequest(req, res, []);

            const allSetHeaderCalls: string[][] = res.setHeader.mock.calls;
            const headerNames = allSetHeaderCalls.map(([name]) => name.toLowerCase());
            expect(headerNames).not.toContain('content-encoding');
        });

        it('skips headers with null or undefined values', async () => {
            const result = {
                status: 200,
                data: {},
                headers: { 'x-null': null, 'x-undefined': undefined, 'x-valid': 'yes' },
            };
            mockProxyService.forwardRequest.mockResolvedValue(result);

            const req = makeMockReq();
            const res = makeMockRes();

            await controller.handleRequest(req, res, []);

            const allSetHeaderCalls = res.setHeader.mock.calls;
            const headerNames = allSetHeaderCalls.map(([name]: [string]) => name.toLowerCase());
            expect(headerNames).not.toContain('x-null');
            expect(headerNames).not.toContain('x-undefined');
        });
    });

    // ─── File grouping ────────────────────────────────────────────────────────

    describe('File grouping', () => {
        it('groups files by fieldname and passes to forwardRequest', async () => {
            mockProxyService.forwardRequest.mockResolvedValue({ status: 200, data: {}, headers: {}, isStream: false });

            const req = makeMockReq({ path: '/api/upload', method: 'POST' });
            const res = makeMockRes();

            const files: any[] = [
                { fieldname: 'doc', buffer: Buffer.from('a'), originalname: 'a.pdf', mimetype: 'application/pdf' },
                { fieldname: 'doc', buffer: Buffer.from('b'), originalname: 'b.pdf', mimetype: 'application/pdf' },
                { fieldname: 'img', buffer: Buffer.from('c'), originalname: 'c.png', mimetype: 'image/png' },
            ];

            await controller.handleRequest(req, res, files);

            const [, , , , , , filesObj] = mockProxyService.forwardRequest.mock.calls[0];
            expect(filesObj.doc).toHaveLength(2);
            expect(filesObj.img).toHaveLength(1);
        });
    });
});
