import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { runWithCorrelationId } from '@ragspace/shared-ts';

const VALID_ID = /^[A-Za-z0-9._-]{1,128}$/;

export function correlation(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header('x-correlation-id');
    const correlationId = incoming && VALID_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Correlation-Id', correlationId);
    runWithCorrelationId(correlationId, next);
}
