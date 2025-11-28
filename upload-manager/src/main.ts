import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port');

  app.enableCors({
    origin: true,
    credentials: true,
  });

  await app.listen(parseInt(port as unknown as string, 10) || 3002);
  logger.log(`Upload Manager service is running on port ${port}`);
}
bootstrap();
