import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: process.env.NODE_ENV === 'production'
      ? ['error', 'warn', 'log']
      : ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  app.enableShutdownHooks();

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') as number;

  app.enableCors({
    origin: true,
    credentials: true,
  });

  await app.listen(port);
  logger.log(`Upload Manager service is running on port ${port}`);

  process.on('SIGTERM', () => {
    logger.log('SIGTERM received — starting graceful shutdown');
    setTimeout(() => {
      logger.error('Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, 30_000).unref();
  });
}

bootstrap();
