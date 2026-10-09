import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

interface RequestContext {
  correlationId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithCorrelationId<T>(correlationId: string | undefined, fn: () => T): T {
  return storage.run({ correlationId: correlationId || randomUUID() }, fn);
}

export function currentCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}
