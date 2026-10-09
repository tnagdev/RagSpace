import type { Response } from 'express';

const PING_MS = 25_000;

export interface SseStream {
    send(event: string, data: unknown): void;
    close(): void;
}

export function openSse(res: Response): SseStream {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Connection', 'keep-alive');
    // Stops nginx from buffering the stream.
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const ping = setInterval(() => res.write(': ping\n\n'), PING_MS);
    ping.unref();
    return {
        send: (event, data) => {
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        },
        close: () => {
            clearInterval(ping);
            res.end();
        },
    };
}
