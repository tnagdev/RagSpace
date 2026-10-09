import { randomUUID } from 'node:crypto';
import amqp, { AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { currentCorrelationId, runWithCorrelationId } from '../context';
import { Envelope } from '../gen/ragspace/events/v1/events';
import { LoggerLike } from '../logging';

export const EVENTS_EXCHANGE = 'ragspace.events';
const DEAD_LETTER_EXCHANGE = `${EVENTS_EXCHANGE}.dlx`;
const MAX_ATTEMPTS = 5;
const PUBLISH_TIMEOUT_MS = 5_000;
const MAX_RECONNECT_MS = 60_000;

export type EventPayload = NonNullable<Envelope['payload']>;
export type EventCase = EventPayload['$case'];

export const ROUTING_KEYS: Record<EventCase, string> = {
  userCreated: 'user.created',
  userDeleted: 'user.deleted',
  fileUploaded: 'file.uploaded',
  fileStageChanged: 'file.stage_changed',
  fileScenesDetected: 'file.scenes_detected',
  fileUpdated: 'file.updated',
  fileDeleted: 'file.deleted',
  collectionDeleted: 'collection.deleted',
};

export class PermanentEventError extends Error {}

export type EventHandler = (envelope: Envelope) => Promise<void>;

export interface SubscribeOptions {
  queue: string;
  routingKeys: string[];
  // Exclusive, auto-deleted queue per process, for fan-out to every instance.
  exclusive?: boolean;
  prefetch?: number;
}

export class EventBus {
  private connection?: AmqpConnectionManager;
  private publisher?: ChannelWrapper;
  private readonly consumers: ChannelWrapper[] = [];
  private readonly attempts = new Map<string, number>();

  constructor(
    private readonly url: string,
    private readonly producer: string,
    private readonly logger: LoggerLike,
  ) {}

  start(): void {
    if (this.connection) return;
    const connection = amqp.connect([this.url], { heartbeatIntervalInSeconds: 30, reconnectTimeInSeconds: 0.5 });
    let failures = 0;
    connection.on('connect', () => {
      failures = 0;
      connection.reconnectTimeInSeconds = 0.5;
      this.logger.log('RabbitMQ connected', 'EventBus');
    });
    connection.on('connectFailed', ({ err }) => {
      failures += 1;
      connection.reconnectTimeInSeconds = backoffMs(failures, MAX_RECONNECT_MS) / 1000;
      this.logger.warn(
        `RabbitMQ connect attempt ${failures} failed (${err?.message}); retrying in ${connection.reconnectTimeInSeconds.toFixed(1)}s`,
        'EventBus',
      );
    });
    connection.on('disconnect', ({ err }) => this.logger.warn(`RabbitMQ disconnected: ${err?.message}`, 'EventBus'));
    this.connection = connection;
    this.publisher = this.connection.createChannel({
      setup: (channel: ConfirmChannel) => channel.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true }),
    });
  }

  async publish(payload: EventPayload, correlationId?: string): Promise<Envelope> {
    if (!this.publisher) throw new Error('EventBus not started');
    const envelope: Envelope = {
      id: randomUUID(),
      type: ROUTING_KEYS[payload.$case],
      occurTime: new Date(),
      correlationId: correlationId ?? currentCorrelationId() ?? randomUUID(),
      producer: this.producer,
      payload,
    };
    await this.publisher.publish(
      EVENTS_EXCHANGE,
      envelope.type,
      Buffer.from(JSON.stringify(Envelope.toJSON(envelope))),
      { persistent: true, contentType: 'application/json', messageId: envelope.id, timeout: PUBLISH_TIMEOUT_MS },
    );
    return envelope;
  }

  subscribe(options: SubscribeOptions, handler: EventHandler): void {
    if (!this.connection) throw new Error('EventBus not started');
    const consumer = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true });
        const queue = options.exclusive
          ? (await channel.assertQueue('', { exclusive: true, autoDelete: true })).queue
          : await this.assertDurableQueue(channel, options.queue);
        for (const key of options.routingKeys) await channel.bindQueue(queue, EVENTS_EXCHANGE, key);
        await channel.prefetch(options.prefetch ?? 10);
        await channel.consume(queue, (message) => void this.dispatch(consumer, message, handler), { noAck: false });
        this.logger.log(`Consuming ${queue} [${options.routingKeys.join(', ')}]`, 'EventBus');
      },
    });
    this.consumers.push(consumer);
  }

  async close(): Promise<void> {
    await Promise.all(this.consumers.map((consumer) => consumer.close()));
    await this.publisher?.close();
    await this.connection?.close();
  }

  private async assertDurableQueue(channel: ConfirmChannel, queue: string): Promise<string> {
    await channel.assertExchange(DEAD_LETTER_EXCHANGE, 'direct', { durable: true });
    await channel.assertQueue(`${queue}.dlq`, { durable: true });
    await channel.bindQueue(`${queue}.dlq`, DEAD_LETTER_EXCHANGE, queue);
    await channel.assertQueue(queue, {
      durable: true,
      deadLetterExchange: DEAD_LETTER_EXCHANGE,
      deadLetterRoutingKey: queue,
    });
    return queue;
  }

  private async dispatch(channel: ChannelWrapper, message: ConsumeMessage | null, handler: EventHandler): Promise<void> {
    if (!message) return;
    let envelope: Envelope;
    try {
      envelope = Envelope.fromJSON(JSON.parse(message.content.toString()));
    } catch (error) {
      this.logger.error('Dropping unparseable event', error, 'EventBus');
      channel.nack(message, false, false);
      return;
    }

    await runWithCorrelationId(envelope.correlationId, async () => {
      try {
        await handler(envelope);
        this.attempts.delete(envelope.id);
        channel.ack(message);
      } catch (error) {
        if (error instanceof PermanentEventError) {
          this.logger.error(`${envelope.type} ${envelope.id} rejected permanently`, error, 'EventBus');
          channel.nack(message, false, false);
          return;
        }
        const attempt = (this.attempts.get(envelope.id) ?? 0) + 1;
        if (attempt >= MAX_ATTEMPTS) {
          this.attempts.delete(envelope.id);
          this.logger.error(`${envelope.type} ${envelope.id} failed ${attempt} times; dead-lettering`, error, 'EventBus');
          channel.nack(message, false, false);
          return;
        }
        this.attempts.set(envelope.id, attempt);
        this.logger.warn(`${envelope.type} ${envelope.id} attempt ${attempt} failed: ${String(error)}`, 'EventBus');
        await sleep(backoffMs(attempt));
        channel.nack(message, false, true);
      }
    });
  }
}

function backoffMs(attempt: number, cap = 30_000): number {
  const base = Math.min(cap, 500 * 2 ** attempt);
  return base / 2 + Math.random() * (base / 2);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
