import { NestFactory } from '@nestjs/core';
import { billingV1, createGrpcServer, listenGrpc } from '@ragspace/shared-ts';
import { AppModule } from './app.module';
import { BillingRpcService } from './billing/billing-rpc.service';
import { eventBus } from './events/event-bus';
import { logger } from './logger';

async function bootstrap() {
    eventBus.start();

    const app = await NestFactory.create(AppModule, { logger });
    app.enableShutdownHooks();
    await app.init();

    const grpcServer = createGrpcServer(logger);
    grpcServer.add(billingV1.BillingServiceDefinition, app.get(BillingRpcService));
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
