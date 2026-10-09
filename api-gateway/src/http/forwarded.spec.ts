import express from 'express';
import request from 'supertest';
import { forwardedHeaders } from './forwarded';

function app(trustProxy: string | boolean) {
    const server = express();
    server.set('trust proxy', trustProxy);
    server.get('/', (req, res) => {
        res.json(forwardedHeaders(req));
    });
    return server;
}

describe('forwardedHeaders', () => {
    it('forwards one protocol behind a TLS proxy instead of appending this hop', async () => {
        const { body } = await request(app('loopback'))
            .get('/')
            .set('X-Forwarded-Proto', 'https')
            .set('X-Forwarded-Host', 'filorag.com')
            .set('X-Forwarded-For', '203.0.113.7');

        expect(body['x-forwarded-proto']).toBe('https');
        expect(body['x-forwarded-host']).toBe('filorag.com');
        expect(body['x-forwarded-for']).toMatch(/^203\.0\.113\.7, /);
    });

    it('keeps only the client-facing values of multi-hop headers', async () => {
        const { body } = await request(app('loopback'))
            .get('/')
            .set('X-Forwarded-Proto', 'https, http')
            .set('X-Forwarded-Host', 'filorag.com, api-gateway:8080');

        expect(body['x-forwarded-proto']).toBe('https');
        expect(body['x-forwarded-host']).toBe('filorag.com');
    });

    it('ignores a forwarded protocol from an untrusted peer', async () => {
        const { body } = await request(app(false)).get('/').set('X-Forwarded-Proto', 'https');

        expect(body['x-forwarded-proto']).toBe('http');
    });
});
