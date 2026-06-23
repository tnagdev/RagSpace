export interface ServiceConfig {
    name: string;
    transport: 'http' | 'microservice';
    url?: string;
    host?: string;
    port?: number;
    timeout?: number;
    routes: string[];
}

export const SERVICES: Record<string, ServiceConfig> = {
    AUTH_SERVICE: {
        name: 'auth-service',
        transport: 'http',
        get url() { return process.env.AUTH_SERVICE_URL; },
        timeout: 5_000,
        routes: ['/api/auth/*'],
    },
    UPLOAD_MANAGER: {
        name: 'upload-manager',
        transport: 'http',
        get url() { return process.env.UPLOAD_MANAGER_URL; },
        timeout: 120_000,
        routes: ['/api/upload', '/api/upload/*', '/api/collections', '/api/collections/*'],
    },
    SCENE_DETECTOR: {
        name: 'scene-detector',
        transport: 'http',
        get url() { return process.env.SCENE_DETECTOR_URL; },
        timeout: 30_000,
        routes: ['/api/scene/*'],
    },
    FILE_EMBEDDER: {
        name: 'file-embedder',
        transport: 'http',
        get url() { return process.env.FILE_EMBEDDER_URL; },
        timeout: 30_000,
        routes: ['/api/embed/*'],
    },
    CHAT_MANAGER: {
        name: 'chat-manager',
        transport: 'http',
        get url() { return process.env.CHAT_MANAGER_URL; },
        timeout: 0,
        routes: ['/api/chat', '/api/chat/*', '/api/conversations', '/api/conversations/*', '/api/greeting'],
    },
    PAYMENT_SERVICE: {
        name: 'payment-service',
        transport: 'http',
        get url() { return process.env.PAYMENT_SERVICE_URL; },
        timeout: 10_000,
        routes: [
            '/api/plans', '/api/plans/*',
            '/api/subscriptions', '/api/subscriptions/*',
            '/api/usage', '/api/usage/*',
            '/api/validation', '/api/validation/*',
            '/api/webhooks/*',
            '/webhooks/*',
        ],
    },
};
