import { resolve } from 'node:path';

function env(name: string, fallback?: string): string {
    const value = process.env[name] ?? fallback;
    if (value === undefined) throw new Error(`Missing required environment variable ${name}`);
    return value;
}

function list(name: string, fallback: string): string[] {
    return env(name, fallback)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

export const config = {
    port: Number(env('PORT', '8080')),
    // Origins allowed to send unsafe requests; the app is served same-origin, so this is its public origin.
    appOrigins: list('APP_ORIGINS', 'http://localhost:3000'),
    trustProxy: env('TRUST_PROXY', 'loopback, linklocal, uniquelocal'),
    openApiPath: env('OPENAPI_PATH', resolve(__dirname, '../../contracts/openapi/public.v1.yaml')),
    rabbitmqUrl: env('RABBITMQ_URL'),
    authHttpUrl: env('AUTH_HTTP_URL', 'http://auth-service:8080'),
    grpc: {
        auth: env('AUTH_GRPC_ADDRESS', 'auth-service:50051'),
        files: env('FILES_GRPC_ADDRESS', 'upload-manager:50051'),
        search: env('SEARCH_GRPC_ADDRESS', 'file-embedder-server:50051'),
        chat: env('CHAT_GRPC_ADDRESS', 'chat-manager:50051'),
        billing: env('BILLING_GRPC_ADDRESS', 'payment-service:50051'),
    },
    sessionCacheMs: 30_000,
    freshSessionMs: 10 * 60_000,
    maxStreamsPerUser: 5,
};
