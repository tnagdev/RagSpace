import { randomUUID } from 'node:crypto';
import { isAbortError } from 'abort-controller-x';
import {
  CallOptions,
  ChannelCredentials,
  Client,
  ClientError,
  ClientMiddlewareCall,
  CompatServiceDefinition,
  createChannel,
  createClientFactory,
  Metadata,
  Status,
} from 'nice-grpc';
import { currentCorrelationId } from '../context';

export interface RpcCallOptions {
  // 0 disables the deadline, for long-lived streams.
  deadlineMs?: number;
}

export type RpcClient<D extends CompatServiceDefinition> = Client<D, RpcCallOptions>;

export interface RpcClientOptions {
  address: string;
  caller: string;
  deadlineMs: number;
}

const SERVICE_CONFIG = JSON.stringify({
  loadBalancingConfig: [{ round_robin: {} }],
  methodConfig: [
    {
      name: [{}],
      retryPolicy: {
        maxAttempts: 3,
        initialBackoff: '0.1s',
        maxBackoff: '1s',
        backoffMultiplier: 2,
        retryableStatusCodes: ['UNAVAILABLE'],
      },
    },
  ],
});

export function createRpcClient<D extends CompatServiceDefinition>(
  definition: D,
  options: RpcClientOptions,
): RpcClient<D> {
  const channel = createChannel(options.address, ChannelCredentials.createInsecure(), {
    'grpc.service_config': SERVICE_CONFIG,
    'grpc.enable_retries': 1,
  });
  return createClientFactory()
    .use(contextMiddleware(options.caller))
    .use(deadlineMiddleware(options.deadlineMs))
    .create(definition, channel);
}

function contextMiddleware(caller: string) {
  return async function* <Request, Response>(
    call: ClientMiddlewareCall<Request, Response, RpcCallOptions>,
    options: CallOptions & RpcCallOptions,
  ): AsyncGenerator<Response, Response | void, undefined> {
    const metadata = Metadata(options.metadata);
    metadata.set('x-correlation-id', currentCorrelationId() ?? randomUUID());
    metadata.set('x-caller', caller);
    let trailer: Metadata | undefined;
    try {
      return yield* call.next(call.request, {
        ...options,
        metadata,
        onTrailer: (value) => {
          trailer = value;
          options.onTrailer?.(value);
        },
      });
    } catch (error) {
      if (error instanceof ClientError && trailer) {
        const meta: Record<string, string> = {};
        for (const [key, values] of trailer) {
          if (key.startsWith('x-')) meta[key] = String(values[0]);
        }
        Object.assign(error, { meta });
      }
      throw error;
    }
  };
}

function deadlineMiddleware(defaultMs: number) {
  return async function* <Request, Response>(
    call: ClientMiddlewareCall<Request, Response, RpcCallOptions>,
    options: CallOptions & RpcCallOptions,
  ): AsyncGenerator<Response, Response | void, undefined> {
    const { deadlineMs = defaultMs, signal: outer, ...rest } = options;
    if (!deadlineMs) return yield* call.next(call.request, options);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deadlineMs);
    const forwardAbort = () => controller.abort();
    outer?.addEventListener('abort', forwardAbort);
    try {
      return yield* call.next(call.request, { ...rest, signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted && !outer?.aborted && isAbortError(error)) {
        throw new ClientError(call.method.path, Status.DEADLINE_EXCEEDED, `Deadline of ${deadlineMs}ms exceeded`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener('abort', forwardAbort);
    }
  };
}
