import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { toNodeHandler } from 'better-auth/node';
import { auth } from 'auth';

const logger = new Logger('AuthService');

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
    : ['http://localhost:3000', 'http://localhost:8000', 'http://localhost:8080'];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'x-user', 'x-session'],
    exposedHeaders: ['Set-Cookie'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    preflightContinue: false,
    optionsSuccessStatus: 204
  });

  const authHandler = toNodeHandler(auth);
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/auth')) {
      return authHandler(req, res);
    }
    const betterAuthProxiedRoutes = ['/auth/forget-password', '/auth/reset-password'];
    if (betterAuthProxiedRoutes.some(route => req.path.startsWith(route))) {
      req.url = `/api${req.url}`;
      return authHandler(req, res);
    }
    next();
  });

  const port = parseInt(process.env.PORT as string, 10) || 8001;
  await app.listen(port);
  logger.log(`Auth Service is running on http://localhost:${port}`);
}
bootstrap();
