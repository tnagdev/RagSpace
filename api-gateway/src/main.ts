import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express, { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { SessionService } from './auth/session.service';
import { config } from './config';
import { authProxy } from './http/auth-proxy';
import { correlation } from './http/correlation';
import { OpenApiValidator } from './http/openapi-validator';
import { originCheck } from './http/origin';
import { ProblemFilter } from './http/problem.filter';
import { RateLimiter } from './http/rate-limit';
import { logger } from './logger';

const BODY_LIMIT = '1mb';
const SWEEP_MS = 60_000;

async function bootstrap() {
    const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false, logger });
    app.set('trust proxy', config.trustProxy);
    app.disable('x-powered-by');
    app.enableShutdownHooks();

    const limiter = new RateLimiter();
    setInterval(() => limiter.sweep(), SWEEP_MS).unref();
    const validator = OpenApiValidator.fromFile(config.openApiPath);

    app.use(correlation);
    app.use('/api/v1', (_req: Request, res: Response, next: NextFunction) => {
        res.setHeader('Cache-Control', 'no-store');
        next();
    });
    app.use('/api/v1', limiter.middleware);
    app.use('/api/v1', originCheck);
    app.use('/api/v1/auth', authProxy(app.get(SessionService)));
    app.use('/api/v1/webhooks', express.raw({ type: () => true, limit: BODY_LIMIT }));
    app.use('/api/v1', express.json({ limit: BODY_LIMIT }));
    app.use('/api/v1', validator.middleware);

    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ProblemFilter());
    await app.listen(config.port);
    logger.log(`API gateway listening on :${config.port}`, 'Bootstrap');
}

void bootstrap();
