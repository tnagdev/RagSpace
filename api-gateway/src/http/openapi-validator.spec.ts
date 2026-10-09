import { resolve } from 'node:path';
import type { Request } from 'express';
import { OpenApiValidator } from './openapi-validator';
import { ApiError } from './problem';

const validator = OpenApiValidator.fromFile(resolve(__dirname, '../../../contracts/openapi/public.v1.yaml'));

function request(method: string, path: string, options: { query?: Record<string, unknown>; body?: unknown; headers?: Record<string, string> } = {}) {
    const headers = Object.fromEntries(Object.entries(options.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    return {
        method,
        path,
        query: options.query ?? {},
        body: options.body,
        header: (name: string) => headers[name.toLowerCase()],
        is: () => (options.body === undefined ? false : 'application/json'),
    } as unknown as Request;
}

function failure(req: Request): ApiError {
    try {
        validator.validate(req);
    } catch (error) {
        return error as ApiError;
    }
    throw new Error('expected validation to fail');
}

describe('OpenApiValidator', () => {
    it('accepts a valid upload and exposes the operation', () => {
        const result = validator.validate(
            request('POST', '/uploads', { body: { fileName: 'a.mp4', sizeBytes: 10, mimeType: 'video/mp4' } }),
        );
        expect(result.operationId).toBe('createUpload');
    });

    it('rejects unknown and missing body fields with field paths', () => {
        const error = failure(request('POST', '/uploads', { body: { fileName: '', sizeBytes: 10, extra: 1 } }));
        expect(error.status).toBe(400);
        const fields = error.extra.errors?.map((e) => e.field);
        expect(fields).toEqual(expect.arrayContaining(['fileName', 'mimeType', 'extra']));
    });

    it('requires a JSON body when the operation does', () => {
        const error = failure(request('POST', '/search'));
        expect(error.extra.errors).toEqual([{ field: 'body', message: 'A JSON body is required' }]);
    });

    it('coerces query parameters and splits comma-separated arrays', () => {
        const result = validator.validate(request('GET', '/files', { query: { limit: '50', ids: 'a,b', type: 'VIDEO' } }));
        expect(result.query).toEqual({ limit: 50, ids: ['a', 'b'], type: 'VIDEO' });
    });

    it('enforces parameter bounds and patterns', () => {
        expect(failure(request('GET', '/files', { query: { limit: '500' } })).extra.errors?.[0].field).toBe('limit');
        expect(failure(request('GET', '/files/bad%20id')).extra.errors?.[0].field).toBe('fileId');
    });

    it('extracts path parameters', () => {
        const result = validator.validate(request('GET', '/conversations/c-1/messages'));
        expect(result.params).toEqual({ conversationId: 'c-1' });
    });

    it('enforces mutually exclusive search scopes', () => {
        const error = failure(request('POST', '/search', { body: { query: 'q', fileIds: ['a'], collectionId: 'c' } }));
        expect(error.status).toBe(400);
    });

    it('accepts search tuning and rejects out-of-range or unknown knobs', () => {
        const tuning = { textWeight: 0.8, imageWeight: 0.2, threshold: 0.3, dynamicRetrieval: false, queryExpansion: false };
        expect(validator.validate(request('POST', '/search', { body: { query: 'q', tuning } })).operationId).toBe('search');
        const error = failure(request('POST', '/search', { body: { query: 'q', tuning: { threshold: 2, useEnhanced: true } } }));
        expect(error.extra.errors?.map((e) => e.field)).toEqual(expect.arrayContaining(['tuning.threshold', 'tuning.useEnhanced']));
    });

    it('treats a missing optional body as empty', () => {
        expect(validator.validate(request('POST', '/subscription/cancel')).operationId).toBe('cancelSubscription');
    });

    it('validates the Idempotency-Key header', () => {
        const error = failure(
            request('POST', '/collections', { body: { name: 'x' }, headers: { 'Idempotency-Key': 'not-a-uuid' } }),
        );
        expect(error.extra.errors?.[0].field).toBe('Idempotency-Key');
    });

    it('returns 404 for unknown routes and 405 for unknown methods', () => {
        expect(failure(request('GET', '/nope')).status).toBe(404);
        expect(failure(request('PUT', '/files')).status).toBe(405);
    });
});
