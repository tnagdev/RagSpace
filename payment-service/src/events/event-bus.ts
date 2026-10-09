import { EventBus } from '@ragspace/shared-ts';
import { logger } from '../logger';

export const eventBus = new EventBus(
    process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672',
    'payment-service',
    logger,
);
