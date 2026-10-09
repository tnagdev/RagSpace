import createClient from 'openapi-fetch';
import type { components, paths } from './schema';

declare global {
    interface Window {
        ENV?: { VITE_API_URL?: string };
    }
}

export type Problem = components['schemas']['Problem'];

export class ApiError extends Error {
    readonly status: number;
    readonly problem: Problem | undefined;

    constructor(status: number, problem: Problem | undefined) {
        super(problem?.detail ?? problem?.title ?? `Request failed with status ${status}`);
        this.status = status;
        this.problem = problem;
    }

    get code(): Problem['code'] | undefined {
        return this.problem?.code;
    }
}

const ORIGIN = (typeof window !== 'undefined' && window.ENV?.VITE_API_URL) || import.meta.env.VITE_API_URL || '';
export const API_BASE_URL = `${ORIGIN}/api/v1`;

// The session lives in an httpOnly cookie, so every call simply includes credentials.
export const api = createClient<paths>({ baseUrl: API_BASE_URL, credentials: 'include' });

type Listener = (problem: Problem) => void;
const quotaListeners = new Set<Listener>();
let unauthenticatedListener: (() => void) | undefined;

export function onQuotaExceeded(listener: Listener): () => void {
    quotaListeners.add(listener);
    return () => quotaListeners.delete(listener);
}

export function onUnauthenticated(listener: () => void): void {
    unauthenticatedListener = listener;
}

function fail(response: Response, error: unknown): never {
    const problem = error && typeof error === 'object' && 'code' in error ? (error as Problem) : undefined;
    if (response.status === 401) unauthenticatedListener?.();
    if (response.status === 402 && problem) quotaListeners.forEach((listener) => listener(problem));
    throw new ApiError(response.status, problem);
}

export async function unwrap<T>(request: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
    const { data, error, response } = await request;
    if (!response.ok) fail(response, error);
    return data as T;
}

export function idempotencyKey(): string {
    return crypto.randomUUID();
}

export interface SseMessage {
    event: string;
    data: string;
}

// fetch-based reader for POST streams (EventSource only supports GET).
export async function* readSse(response: Response): AsyncGenerator<SseMessage> {
    if (!response.ok) {
        const problem = await response.json().catch(() => undefined);
        fail(response, problem);
    }
    const reader = response.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
            const block = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            boundary = buffer.indexOf('\n\n');
            let event = 'message';
            const data: string[] = [];
            for (const line of block.split('\n')) {
                if (line.startsWith('event:')) event = line.slice(6).trim();
                else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
            }
            if (data.length) yield { event, data: data.join('\n') };
        }
    }
}
