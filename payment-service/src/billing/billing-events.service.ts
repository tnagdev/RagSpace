import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { eventsV1 } from '@ragspace/shared-ts';
import { eventBus } from '../events/event-bus';
import { SubscriptionService } from '../subscription/subscription.service';

@Injectable()
export class BillingEventsService implements OnModuleInit {
    private readonly logger = new Logger(BillingEventsService.name);

    constructor(private readonly subscriptions: SubscriptionService) { }

    onModuleInit(): void {
        eventBus.subscribe(
            { queue: 'billing.events', routingKeys: ['user.created', 'user.deleted'] },
            (envelope) => this.handle(envelope),
        );
    }

    private async handle(envelope: eventsV1.Envelope): Promise<void> {
        switch (envelope.payload?.$case) {
            case 'userCreated':
                await this.subscriptions.createFreeSubscription(envelope.payload.userCreated.userId);
                this.logger.log(`Free subscription ensured for ${envelope.payload.userCreated.userId}`);
                return;
            case 'userDeleted': {
                const { userId } = envelope.payload.userDeleted;
                const removed = await this.subscriptions.purgeUser(userId);
                this.logger.log(`Purged ${removed} subscription(s) for deleted user ${userId}`);
                return;
            }
            default:
                this.logger.warn(`Ignoring ${envelope.type}`);
        }
    }
}
