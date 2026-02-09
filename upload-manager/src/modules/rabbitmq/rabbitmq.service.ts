import {
    Injectable,
    Logger,
    OnModuleInit,
    OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqp-connection-manager';
import { ChannelWrapper } from 'amqp-connection-manager';
import { Channel } from 'amqplib';
import { AuthSession, AuthUser } from 'src/common/decorators/current-user.decorator';

export enum FileEventType {
    UPLOAD_STARTED = 'file.upload.started',
    UPLOAD_PROGRESS = 'file.upload.progress',
    UPLOAD_COMPLETED = 'file.upload.completed',
    UPLOAD_FAILED = 'file.upload.failed',
    PROCESSING_STARTED = 'file.processing.started',
    PROCESSING_COMPLETED = 'file.processing.completed',
    PROCESSING_FAILED = 'file.processing.failed',
    FILE_DELETED = 'file.deleted',
}

export interface FileEvent {
    type: FileEventType;
    fileId?: string;
    fileIds?: string[];
    user: AuthUser;
    session?: AuthSession;
    timestamp: Date;
    data?: any;
}

@Injectable()
export class RabbitmqService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(RabbitmqService.name);
    private connection: amqp.AmqpConnectionManager;
    private channelWrapper: ChannelWrapper;
    private exchange: string;
    private queue: string;
    private url: string;

    constructor(private configService: ConfigService) { }

    async onModuleInit() {
        try {
            this.exchange =
                this.configService.get<string>('rabbitmq.exchange') as string;

            this.queue =
                this.configService.get<string>('rabbitmq.queue') as string;

            this.url =
                this.configService.get<string>('rabbitmq.url') as string;

            if (!this.queue || !this.exchange || !this.url) {
                throw new Error(
                    'RabbitMQ configuration is missing. Please check RABBITMQ_URL, RABBITMQ_EXCHANGE, and RABBITMQ_QUEUE environment variables.',
                );
            }

            this.connection = amqp.connect([this.url], {
                heartbeatIntervalInSeconds: 30,
                reconnectTimeInSeconds: 10,
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

            this.channelWrapper = this.connection.createChannel({
                setup: async (channel: Channel) => {
                    await channel.assertExchange(this.exchange, 'topic', {
                        durable: true,
                    });

                    await channel.assertQueue(this.queue, {
                        durable: true,
                    });

                    await channel.bindQueue(this.queue, this.exchange, 'file.*');

                    this.logger.log(
                        `Exchange "${this.exchange}" and queue "${this.queue}" are ready`,
                    );
                },
            });

            await this.channelWrapper.waitForConnect();
        } catch (error) {
            this.logger.error('Error initializing RabbitMQ', error);
            throw error;
        }
    }

    async publishEvent(event: FileEvent): Promise<void> {
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
                `Published event: ${event.type} for file ${event.fileId}`,
            );
        } catch (error) {
            this.logger.error(`Failed to publish event: ${event.type}`, error);
            throw error;
        }
    }

    async onModuleDestroy() {
        try {
            await this.channelWrapper?.close();
            await this.connection?.close();
            this.logger.log('RabbitMQ connection closed');
        } catch (error) {
            this.logger.error('Error closing RabbitMQ connection', error);
        }
    }
}
