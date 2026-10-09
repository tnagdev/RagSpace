import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { authV1, createGrpcServer, listenGrpc, runWithCorrelationId } from '@ragspace/shared-ts';
import { toNodeHandler } from 'better-auth/node';
import { auth, AUTH_BASE_PATH } from '../auth';
import { AppModule } from './app.module';
import { AuthRpcService } from './auth/auth-rpc.service';
import { eventBus } from './events/event-bus';
import { logger } from './logger';
import { ProblemFilter, validationException } from './problem.filter';

const OAUTH_CALLBACK = new RegExp(`^${AUTH_BASE_PATH}/oauth/([a-z-]+)/callback$`);

async function bootstrap() {
    const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger });
    app.enableShutdownHooks();

    app.use((req, _res, next) => runWithCorrelationId(req.header('x-correlation-id'), next));

    const betterAuthHandler = toNodeHandler(auth);
    app.use((req, res, next) => {
        const match = OAUTH_CALLBACK.exec(req.path);
        if (!match) return next();
        const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        req.url = `${AUTH_BASE_PATH}/callback/${match[1]}${query}`;
        return betterAuthHandler(req, res);
    });

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
            exceptionFactory: validationException,
        }),
    );
    app.useGlobalFilters(new ProblemFilter());

    eventBus.start();

    const grpcServer = createGrpcServer(logger);
    grpcServer.add(authV1.AuthServiceDefinition, app.get(AuthRpcService));
    await listenGrpc(grpcServer, logger);

    process.on('SIGTERM', () => {
        void grpcServer.shutdown();
        void eventBus.close();
    });

    await app.listen(Number(process.env.PORT) || 8080);
    logger.log(`HTTP listening on :${Number(process.env.PORT) || 8080}`, 'Bootstrap');
}

void bootstrap();
