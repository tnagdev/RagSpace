import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { SessionGuard } from './auth/session.guard';
import { SessionService } from './auth/session.service';
import { AccountController } from './controllers/account.controller';
import { BillingController } from './controllers/billing.controller';
import { CollectionsController } from './controllers/collections.controller';
import { ConversationsController } from './controllers/conversations.controller';
import { EventsController } from './controllers/events.controller';
import { FilesController } from './controllers/files.controller';
import { HealthController } from './controllers/health.controller';
import { SearchController } from './controllers/search.controller';
import { WebhooksController } from './controllers/webhooks.controller';
import { FileUpdatesService } from './events/file-updates.service';
import { RpcModule } from './rpc/clients';

@Module({
    imports: [RpcModule],
    controllers: [
        HealthController,
        AccountController,
        FilesController,
        EventsController,
        CollectionsController,
        SearchController,
        ConversationsController,
        BillingController,
        WebhooksController,
    ],
    providers: [SessionService, FileUpdatesService, { provide: APP_GUARD, useClass: SessionGuard }],
})
export class AppModule {}
