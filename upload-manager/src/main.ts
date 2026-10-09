import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { collectionsV1, createGrpcServer, filesV1, listenGrpc, runWithCorrelationId } from '@ragspace/shared-ts';
import { AppModule } from './app.module';
import { CollectionsRpcService } from './collections/collections-rpc.service';
import { eventBus } from './events/event-bus';
import { FilesRpcService } from './files/files-rpc.service';
import { logger } from './logger';

async function bootstrap() {
    eventBus.start();

    const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger });
    app.enableShutdownHooks();
    app.useBodyParser('json', { limit: '10mb' });
    app.use((req, _res, next) => runWithCorrelationId(req.header('x-correlation-id'), next));
    await app.init();

    const grpcServer = createGrpcServer(logger);
    grpcServer.add(filesV1.FileServiceDefinition, app.get(FilesRpcService));
    grpcServer.add(collectionsV1.CollectionServiceDefinition, app.get(CollectionsRpcService));
    await listenGrpc(grpcServer, logger);

    process.on('SIGTERM', () => {
        void grpcServer.shutdown();
        void eventBus.close();
    });

    const port = Number(process.env.PORT) || 8080;
    await app.listen(port);
    logger.log(`HTTP listening on :${port}`, 'Bootstrap');
}

void bootstrap();
