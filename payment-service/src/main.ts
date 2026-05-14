import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
    const logger = new Logger('PaymentService');
    const app = await NestFactory.create(AppModule, {
        logger: process.env.NODE_ENV === 'production'
            ? ['error', 'warn', 'log']
            : ['error', 'warn', 'log', 'debug', 'verbose'],
    });

    app.enableShutdownHooks();

    const configService = app.get(ConfigService);
    const port = configService.get('PORT', 3006);

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }),
    );

    app.enableCors({
        origin: true,
        credentials: true,
    });

    await app.listen(port);
    logger.log(`Payment Service is running on: http://localhost:${port}`);

    process.on('SIGTERM', () => {
        logger.log('SIGTERM received — starting graceful shutdown');
        setTimeout(() => {
            logger.error('Graceful shutdown timed out — forcing exit');
            process.exit(1);
        }, 30_000).unref();
    });
}

bootstrap();
