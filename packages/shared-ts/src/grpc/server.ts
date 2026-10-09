import { randomUUID } from 'node:crypto';
import { isAbortError } from 'abort-controller-x';
import {
  CallContext,
  ClientError,
  createServer,
  Server,
  ServerError,
  ServerMiddlewareCall,
  Status,
} from 'nice-grpc';
import { HealthDefinition, HealthServiceImpl } from 'nice-grpc-server-health';
import { runWithCorrelationId } from '../context';
import { LoggerLike } from '../logging';
import { ERROR_CODE_KEY, RpcError } from './errors';

export const GRPC_PORT = 50051;

const PROPAGATED_STATUSES = new Set([Status.UNAVAILABLE, Status.DEADLINE_EXCEEDED, Status.RESOURCE_EXHAUSTED]);

export function createGrpcServer(logger: LoggerLike): Server {
  const server = createServer().use(callMiddleware(logger));
  server.add(HealthDefinition, HealthServiceImpl());
  return server;
}

export async function listenGrpc(server: Server, logger: LoggerLike, port = GRPC_PORT): Promise<void> {
  await server.listen(`0.0.0.0:${port}`);
  logger.log(`gRPC listening on :${port}`, 'Grpc');
}

function callMiddleware(logger: LoggerLike) {
  return async function* <Request, Response>(
    call: ServerMiddlewareCall<Request, Response>,
    context: CallContext,
  ): AsyncGenerator<Awaited<Response>, Awaited<Response> | void, undefined> {
    const correlationId = context.metadata.get('x-correlation-id') ?? randomUUID();
    const path = call.method.path;
    const started = Date.now();
    const run = <T>(fn: () => T) => runWithCorrelationId(correlationId, fn);
    const generator = call.next(call.request, context);

    try {
      while (true) {
        const step = await run(() => generator.next());
        if (step.done) {
          run(() => logger.log(`${path} OK ${Date.now() - started}ms`, 'Grpc'));
          return step.value;
        }
        yield step.value as Awaited<Response>;
      }
    } catch (error) {
      if (error instanceof RpcError) {
        context.trailer.set(ERROR_CODE_KEY, error.reason);
        for (const [key, value] of Object.entries(error.meta)) context.trailer.set(key, value);
        run(() => logger.warn(`${path} ${Status[error.code]} ${error.details}`, 'Grpc'));
        throw error;
      }
      if (error instanceof ServerError || isAbortError(error)) throw error;
      if (error instanceof ClientError && PROPAGATED_STATUSES.has(error.code)) {
        const meta = (error as ClientError & { meta?: Record<string, string> }).meta ?? {};
        for (const [key, value] of Object.entries(meta)) context.trailer.set(key, value);
        run(() => logger.warn(`${path} upstream ${error.path} ${Status[error.code]}: ${error.details}`, 'Grpc'));
        throw new ServerError(error.code, error.details);
      }
      run(() => logger.error(`${path} INTERNAL`, error, 'Grpc'));
      throw new ServerError(Status.INTERNAL, 'Internal error');
    }
  };
}
