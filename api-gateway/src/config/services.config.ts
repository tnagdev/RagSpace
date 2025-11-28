export interface ServiceConfig {
    name: string;
    transport: 'http' | 'microservice';
    url?: string;
    host?: string;
    port?: number;
    routes: string[];
}

export const SERVICES: Record<string, ServiceConfig> = {
    AUTH_SERVICE: {
        name: 'auth-service',
        transport: 'http',
        url: process.env.AUTH_SERVICE_URL || 'http://localhost:8001',
        routes: ['/api/auth/*'],
    },
    UPLOAD_MANAGER: {
        name: 'upload-manager',
        transport: 'http',
        url: process.env.UPLOAD_MANAGER_URL || 'http://localhost:3002',
        routes: ['/api/upload', '/api/upload/*'],
    },
    SCENE_DETECTOR: {
        name: 'scene-detector',
        transport: 'http',
        url: process.env.SCENE_DETECTOR_URL || 'http://scene-detector:3003',
        routes: ['/api/scene/*'],
    },
    FILE_EMBEDDER: {
        name: 'file-embedder',
        transport: 'http',
        url: process.env.FILE_EMBEDDER_URL || 'http://file-embedder:3004',
        routes: ['/api/embed/*'],
    },
    CHAT_MANAGER: {
        name: 'chat-manager',
        transport: 'http',
        url: process.env.CHAT_MANAGER_URL || 'http://chat-manager:3005',
        routes: ['/api/chat/*'],
    },
};
