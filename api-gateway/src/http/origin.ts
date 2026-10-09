import type { NextFunction, Request, Response } from 'express';
import { config } from '../config';
import { forbidden, sendProblem, toProblem } from './problem';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Webhooks are server-to-server and authenticated by the provider signature instead.
export function originCheck(req: Request, res: Response, next: NextFunction): void {
    if (SAFE_METHODS.has(req.method) || req.path.startsWith('/webhooks/')) return next();
    const origin = req.header('origin');
    if (origin && config.appOrigins.includes(origin)) return next();
    sendProblem(res, toProblem(forbidden('Cross-origin request refused')));
}
