import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';

function makeHost(): { host: ArgumentsHost; mockJson: jest.Mock; mockStatus: jest.Mock } {
    const mockJson = jest.fn();
    const mockStatus = jest.fn().mockReturnValue({ json: mockJson });
    const mockResponse = { status: mockStatus };
    const host = {
        switchToHttp: () => ({ getResponse: () => mockResponse }),
    } as unknown as ArgumentsHost;
    return { host, mockJson, mockStatus };
}

describe('GlobalExceptionFilter', () => {
    let filter: GlobalExceptionFilter;

    beforeEach(() => {
        filter = new GlobalExceptionFilter();
    });

    // ─── TC-GEF-01: HttpException with string response ────────────────────────

    describe('TC-GEF-01: HttpException string response', () => {
        it('returns statusCode, message and default error for string HttpException', () => {
            const { host, mockStatus, mockJson } = makeHost();
            filter.catch(new HttpException('Unauthorized', 401), host);

            expect(mockStatus).toHaveBeenCalledWith(401);
            expect(mockJson).toHaveBeenCalledWith(
                expect.objectContaining({
                    statusCode: 401,
                    message: 'Unauthorized',
                    error: 'Internal Server Error',
                    timestamp: expect.any(String),
                }),
            );
        });

        it('timestamp is a valid ISO 8601 string', () => {
            const { host, mockJson } = makeHost();
            filter.catch(new HttpException('Unauthorized', 401), host);
            const [payload] = mockJson.mock.calls[0];
            expect(() => new Date(payload.timestamp)).not.toThrow();
            expect(new Date(payload.timestamp).toISOString()).toBe(payload.timestamp);
        });
    });

    // ─── TC-GEF-02: HttpException with object response ───────────────────────

    describe('TC-GEF-02: HttpException object response', () => {
        it('extracts message and error from the object response', () => {
            const { host, mockStatus, mockJson } = makeHost();
            filter.catch(
                new HttpException({ message: 'Invalid input', error: 'BadRequest' }, 400),
                host,
            );

            expect(mockStatus).toHaveBeenCalledWith(400);
            expect(mockJson).toHaveBeenCalledWith(
                expect.objectContaining({
                    statusCode: 400,
                    message: 'Invalid input',
                    error: 'BadRequest',
                }),
            );
        });

        it('falls back to default error string when object has no error field', () => {
            const { host, mockJson } = makeHost();
            filter.catch(new HttpException({ message: 'Something bad' }, 422), host);
            const [payload] = mockJson.mock.calls[0];
            expect(payload.error).toBe('Internal Server Error');
            expect(payload.message).toBe('Something bad');
        });
    });

    // ─── TC-GEF-03: Generic Error ────────────────────────────────────────────

    describe('TC-GEF-03: Generic Error', () => {
        it('returns 500 with the Error message', () => {
            const { host, mockStatus, mockJson } = makeHost();
            filter.catch(new Error('DB connection failed'), host);

            expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
            expect(mockJson).toHaveBeenCalledWith(
                expect.objectContaining({
                    statusCode: 500,
                    message: 'DB connection failed',
                    error: 'Internal Server Error',
                }),
            );
        });
    });

    // ─── TC-GEF-04: Unknown (non-Error) exception ────────────────────────────

    describe('TC-GEF-04: Unknown exception (string throw)', () => {
        it('returns 500 with generic "Internal server error" message', () => {
            const { host, mockStatus, mockJson } = makeHost();
            // eslint-disable-next-line @typescript-eslint/no-throw-literal
            filter.catch('string error' as unknown, host);

            expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
            expect(mockJson).toHaveBeenCalledWith(
                expect.objectContaining({
                    statusCode: 500,
                    message: 'Internal server error',
                    error: 'Internal Server Error',
                }),
            );
        });

        it('returns 500 with generic message for null exception', () => {
            const { host, mockStatus, mockJson } = makeHost();
            filter.catch(null as unknown, host);

            expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
            expect(mockJson).toHaveBeenCalledWith(
                expect.objectContaining({
                    statusCode: 500,
                    message: 'Internal server error',
                }),
            );
        });
    });

    // ─── Additional HttpException status codes ────────────────────────────────

    describe('HttpException status propagation', () => {
        it.each([
            [400, 'Bad Request'],
            [403, 'Forbidden'],
            [404, 'Not Found'],
            [500, 'Server Error'],
        ])('propagates status %d from HttpException', (statusCode, msg) => {
            const { host, mockStatus } = makeHost();
            filter.catch(new HttpException(msg, statusCode), host);
            expect(mockStatus).toHaveBeenCalledWith(statusCode);
        });
    });
});
