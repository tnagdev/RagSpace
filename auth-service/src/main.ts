import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';

const logger = new Logger('AuthService');

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
    exposedHeaders: ['*'],
    allowedHeaders: ['*'],
    methods: ['*'],
  });

  // Enable validation pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = parseInt(process.env.PORT as string, 10) || 8001;
  await app.listen(port);

  logger.log(`Auth Service is running on http://localhost:${port}`);
}
bootstrap();
