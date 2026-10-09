import type { IncomingMessage, ServerResponse } from 'node:http';
import type { NextFunction, Request, Response } from 'express';
import httpProxy from 'http-proxy';
import { currentCorrelationId, problem } from '@ragspace/shared-ts';
import type { SessionService } from '../auth/session.service';
import { config } from '../config';
import { logger } from '../logger';
import { forwardedHeaders } from './forwarded';
import { sendProblem } from './problem';

// These end or rotate the session, so the cached validation must not outlive them.
const SESSION_ENDING = /^\/api\/v1\/auth\/(sign-out|password\/(reset|change))$/;

// auth-service (better-auth) owns these flows because they set cookies and perform OAuth redirects.
export function authProxy(sessions: SessionService) {
    const proxy = httpProxy.createProxyServer({ target: config.authHttpUrl, timeout: 15_000, proxyTimeout: 15_000 });
    proxy.on('proxyRes', (_proxyRes, req: IncomingMessage) => {
        if (req.method === 'POST' && SESSION_ENDING.test((req.url ?? '').split('?')[0])) sessions.evict(req.headers.cookie);
    });
    proxy.on('error', (error, _req, res) => {
        logger.error(`Auth passthrough failed: ${error.message}`, 'AuthProxy');
        if ('setHeader' in res) sendProblem(res as unknown as Response, problem(503, 'upstream_unavailable', 'Authentication is unavailable'));
    });

    return (req: Request, res: Response, _next: NextFunction): void => {
        req.url = req.originalUrl;
        req.headers['x-correlation-id'] = currentCorrelationId() ?? '';
        Object.assign(req.headers, forwardedHeaders(req));
        proxy.web(req, res as unknown as ServerResponse);
    };
}
