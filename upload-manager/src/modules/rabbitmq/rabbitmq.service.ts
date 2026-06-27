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
import { AuthSession, AuthUser } from 'src/common/decorators/current-user.decorator';
import { WsService } from '../ws/ws.service';
import { PrismaService } from '../prisma/prisma.service';

export enum FileEventType {
    UPLOAD_STARTED = 'file.upload.started',
    UPLOAD_PROGRESS = 'file.upload.progress',
    UPLOAD_COMPLETED = 'file.upload.completed',
    UPLOAD_FAILED = 'file.upload.failed',
    PROCESSING_STARTED = 'file.processing.started',
    PROCESSING_PROGRESS = 'file.processing.progress',
    PROCESSING_RETRYING = 'file.processing.retrying',
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
    private connection!: amqp.AmqpConnectionManager;
    private channelWrapper!: ChannelWrapper;
    private consumerWrapper!: ChannelWrapper;
    private exchange!: string;
    private queue!: string;
    private url!: string;

    constructor(
        private configService: ConfigService,
        private wsService: WsService,
        private prisma: PrismaService,
    ) { }

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
                    // Main exchange
                    await channel.assertExchange(this.exchange, 'topic', {
                        durable: true,
                    });

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

                    await channel.bindQueue(this.queue, this.exchange, 'file.#');

                    this.logger.log(
                        `Exchange "${this.exchange}" and queue "${this.queue}" are ready (DLX: ${dlxName})`,
                    );
                },
            });

            // Ephemeral exclusive queue for SSE broadcasting — receives live events only
            this.consumerWrapper = this.connection.createChannel({
                setup: async (channel: Channel) => {
                    await channel.assertExchange(this.exchange, 'topic', { durable: true });
                    const sseQueue = await channel.assertQueue('', {
                        exclusive: true,
                        autoDelete: true,
                        durable: false,
                    });
                    await channel.bindQueue(sseQueue.queue, this.exchange, 'file.#');
                    await channel.consume(
                        sseQueue.queue,
                        (msg) => this.handleSseMessage(msg),
                        { noAck: true },
                    );
                    this.logger.log(`SSE consumer queue "${sseQueue.queue}" ready`);
                },
            });

            await this.channelWrapper.waitForConnect();
        } catch (error) {
            this.logger.error('Error initializing RabbitMQ', error);
            throw error;
        }
    }

    private async handleSseMessage(msg: ConsumeMessage | null): Promise<void> {
        if (!msg) return;
        let body: any;
        try {
            body = JSON.parse(msg.content.toString());
        } catch {
            return;
        }

        const fileId: string | undefined = body.fileId;
        // Python services publish userId at top level; NestJS publishes user.id
        const userId: string | undefined = body.userId ?? body.user?.id;
        if (!fileId || !userId) return;

        if (!this.wsService.hasClients(userId)) return;

        try {
            const file = await this.prisma.file.findUnique({
                where: { id: fileId },
                select: {
                    id: true, userId: true, filename: true, originalFilename: true,
                    fileSize: true, mimeType: true, fileType: true, s3Key: true,
                    s3Url: true, uploadStatus: true, processingStatus: true,
                    processingStage: true, thumbnailPath: true, errorMessage: true,
                    processingRetryCount: true, createdAt: true, updatedAt: true,
                },
            });
            if (!file) return;

            const stage = body.data?.stage ?? body.stage;

            // Always broadcast the DB-authoritative file object. The `stage` field in the
            // payload tells the frontend what kind of progress this is (may differ from
            // file.processingStage during simultaneous pipeline stages such as EMBEDDING +
            // SCENE_DETECTION running in parallel). Never override processingStage here —
            // doing so corrupts the React Query cache and causes stage-label flips.
            const progressValue = body.data?.progress ?? undefined;

            this.wsService.broadcast(file.userId, {
                fileId: file.id,
                type: body.type,
                progress: progressValue,
                stage,
                file,
            });
        } catch (error) {
            this.logger.error(`WS broadcast failed for file ${fileId}`, error);
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
            await this.consumerWrapper?.close();
            await this.channelWrapper?.close();
            await this.connection?.close();
            this.logger.log('RabbitMQ connections closed');
        } catch (error) {
            this.logger.error('Error closing RabbitMQ connection', error);
        }
    }
}
