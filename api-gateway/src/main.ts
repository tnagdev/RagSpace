import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import httpProxy = require('http-proxy');
import type { IncomingMessage } from 'http';
import type { Socket } from 'net';

const logger = new Logger('API-Gateway');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: process.env.NODE_ENV === 'production'
      ? ['error', 'warn', 'log']
      : ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  app.enableShutdownHooks();

  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
    : ['http://localhost:3000', 'http://localhost:8080'];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    exposedHeaders: ['Set-Cookie'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'X-Correlation-Id'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    preflightContinue: false,
    optionsSuccessStatus: 204
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api');

  const port = process.env.PORT || 3000;
  const server = await app.listen(port);
  logger.log(`HTTP API Gateway is running on http://localhost:${port}`);
  logger.log(`Health check: http://localhost:${port}/api/health`);

  const uploadManagerUrl = process.env.UPLOAD_MANAGER_URL || 'http://localhost:8002';
  const wsProxy = httpProxy.createProxyServer({ target: uploadManagerUrl, ws: true });
  wsProxy.on('error', (err, _req, socket) => {
    logger.error(`WS proxy error: ${(err as Error).message}`);
    if (socket && typeof (socket as Socket).destroy === 'function') {
      (socket as Socket).destroy();
    }
  });

  server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
    if (req.url?.startsWith('/ws/')) {
      logger.debug(`WS upgrade → ${uploadManagerUrl}${req.url}`);
      wsProxy.ws(req, socket, head);
    } else {
      socket.destroy();
    }
  });

  process.on('SIGTERM', () => {
    logger.log('SIGTERM received — starting graceful shutdown');
    setTimeout(() => {
      logger.error('Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, 30_000).unref();
  });
}

bootstrap();
