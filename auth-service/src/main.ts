import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { toNodeHandler } from 'better-auth/node';
import { auth } from 'auth';

const logger = new Logger('AuthService');

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors({
    origin: ['*'],
    credentials: true,
    allowedHeaders: ['*'],
    exposedHeaders: ['*'],
    methods: ['*']
  });

  const authHandler = toNodeHandler(auth);
  app.use((req, res, next) => {
    if (req.path.startsWith('/better-auth')) {
      return authHandler(req, res);
    }
    next();
  });

  const port = parseInt(process.env.PORT as string, 10) || 8001;
  await app.listen(port);
  logger.log(`Auth Service is running on http://localhost:${port}`);
}
bootstrap();
