import {
    Injectable,
    Logger,
    OnModuleInit,
    OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqp-connection-manager';
import { ChannelWrapper } from 'amqp-connection-manager';
import { Channel, ConsumeMessage } from 'amqplib';
import type { AuthUser } from '@ragspace/shared-ts';

export enum UserEventType {
    USER_CREATED = 'user.created',
    USER_DELETED = 'user.deleted'
}

export interface UserEvent {
    type: UserEventType;
    user: AuthUser;
    timestamp: Date;
    data?: any;
}

@Injectable()
export class RabbitmqService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(RabbitmqService.name);
    private connection!: amqp.AmqpConnectionManager;
    private channelWrapper!: ChannelWrapper;
    private consumerWrapper!: ChannelWrapper;
    private exchange!: string;
    private queue!: string;
    private url!: string;

    constructor(
        private configService: ConfigService,
    ) { }

    async onModuleInit() {
        try {
            this.exchange = this.configService.get<string>('rabbitmq.exchange') as string;
            this.queue = this.configService.get<string>('rabbitmq.queue') as string;
            this.url = this.configService.get<string>('rabbitmq.url') as string;

            if (!this.queue || !this.exchange || !this.url) {
                throw new Error(
                    'RabbitMQ configuration is missing. Please check RABBITMQ_URL, RABBITMQ_EXCHANGE, and RABBITMQ_QUEUE environment variables.',
                );
            }

            this.connection = amqp.connect([this.url], {
                heartbeatIntervalInSeconds: 15,
                reconnectTimeInSeconds: 5,
            });

            this.connection.on('connect', () => {
                this.logger.log('Successfully connected to RabbitMQ');
            });

            this.connection.on('disconnect', (err) => {
                this.logger.warn('Disconnected from RabbitMQ', err);
            });

            this.connection.on('connectFailed', (err) => {
                this.logger.error('Failed to connect to RabbitMQ', err);
            });

            this.connection.on('blocked', (reason) => {
                this.logger.warn('RabbitMQ connection blocked:', reason);
            });

            this.connection.on('unblocked', () => {
                this.logger.log('RabbitMQ connection unblocked');
            });

            this.channelWrapper = this.connection.createChannel({
                setup: async (channel: Channel) => {
                    await channel.assertExchange(this.exchange, 'topic', { durable: true });

                    // Dead-letter exchange — receives messages that fail processing
                    const dlxName = `${this.exchange}.dlx`;
                    const dlqName = `${this.queue}.dead-letter`;
                    await channel.assertExchange(dlxName, 'topic', { durable: true });
                    await channel.assertQueue(dlqName, { durable: true });
                    await channel.bindQueue(dlqName, dlxName, '#');

                    // Main queue with DLX routing and 24-hour message TTL
                    await channel.assertQueue(this.queue, {
                        durable: true,
                        arguments: {
                            'x-dead-letter-exchange': dlxName,
                            'x-message-ttl': 86_400_000, // 24 h
                        },
                    });

                    await channel.bindQueue(this.queue, this.exchange, 'user.*');
                    this.logger.log(
                        `Exchange "${this.exchange}" and queue "${this.queue}" are ready (DLX: ${dlxName})`,
                    );
                },
            });

            await this.channelWrapper.waitForConnect();
        } catch (error) {
            this.logger.error('Error initializing RabbitMQ', error);
            throw error;
        }
    }


    async publishEvent(event: UserEvent): Promise<void> {
        try {
            const routingKey = event.type;
            const message = JSON.stringify({
                ...event,
                timestamp: event.timestamp.toISOString(),
            });

            await this.channelWrapper.publish(
                this.exchange,
                routingKey,
                Buffer.from(message),
                {
                    persistent: true,
                    contentType: 'application/json',
                    timestamp: Date.now(),
                },
            );

            this.logger.debug(
                `Published event: ${event.type} for user ${event.user.id} with routing key "${routingKey}"`,
            );
        } catch (error) {
            this.logger.error(`Failed to publish event: ${event.type}`, error);
            throw error;
        }
    }

    async onModuleDestroy() {
        try {
            await this.consumerWrapper?.close();
            await this.channelWrapper?.close();
            await this.connection?.close();
            this.logger.log('RabbitMQ connections closed');
        } catch (error) {
            this.logger.error('Error closing RabbitMQ connection', error);
        }
    }
}
