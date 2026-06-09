import {
    Injectable,
    CanActivate,
    ExecutionContext,
    UnauthorizedException,
    Logger,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Request } from 'express';
import { firstValueFrom } from 'rxjs';
import { SERVICES } from '../config/services.config';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from 'src/common/decorators/public.decorator';

interface CachedSession {
    user: any;
    session: any;
    expiresAt: number;
}

@Injectable()
export class AuthGuard implements CanActivate {
    private readonly logger = new Logger(AuthGuard.name);
    private readonly sessionCache = new Map<string, CachedSession>();
    private readonly SESSION_CACHE_TTL_MS = 30_000;

    private publicRoutes: string[] = [
        '/api/auth/signup',
        '/api/auth/signin',
        '/api/auth/google',
        '/api/auth/google/login',
        '/api/auth/google/callback',
        '/api/auth/session',
        '/api/auth/health',
        '/api/auth/forget-password',
        '/api/auth/forgot-password',
        '/api/webhooks/lemon-squeezy',
        '/api/webhooks/razorpay',
        '/webhooks/lemon-squeezy',
        '/webhooks/razorpay',
    ];

    private publicRoutePrefixes: string[] = [
        '/api/plans',
        '/api/auth/reset-password',
    ];

    constructor(
        private readonly httpService: HttpService,
        private readonly reflector: Reflector,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (isPublic) return true;

        const path = context.switchToHttp().getRequest<Request>().path;
        if (this.publicRoutes.includes(path)) {
            return true;
        }

        if (this.publicRoutePrefixes.some(prefix => path.startsWith(prefix))) {
            return true;
        }

        const request = context.switchToHttp().getRequest<Request>();
        const cacheKey = request.headers.cookie || '';

        const cached = this.sessionCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            request['user'] = cached.user;
            request['session'] = cached.session;
            return true;
        }
        if (cached) this.sessionCache.delete(cacheKey);

        try {
            const authServiceUrl = SERVICES.AUTH_SERVICE.url;
            const authHeaders = {
                cookie: request.headers.cookie || '',
                'user-agent': request.headers['user-agent'] || '',
                ...(request.headers.authorization ? { authorization: request.headers.authorization } : {}),
            };

            const response = await firstValueFrom(
                this.httpService.get(`${authServiceUrl}/auth/session`, {
                    headers: authHeaders,
                    withCredentials: true,
                    timeout: 5000,
                })
            );
            const sessionData = response.data;
            if (!sessionData || !sessionData.user || !sessionData.session) {
                this.logger.error('Invalid session response structure');
                throw new UnauthorizedException('No authentication provided');
            }

            this.sessionCache.set(cacheKey, {
                user: sessionData.user,
                session: sessionData.session,
                expiresAt: Date.now() + this.SESSION_CACHE_TTL_MS,
            });

            if (this.sessionCache.size > 5_000) {
                const now = Date.now();
                for (const [key, value] of this.sessionCache) {
                    if (value.expiresAt < now) this.sessionCache.delete(key);
                }
            }

            request['user'] = sessionData.user;
            request['session'] = sessionData.session;
            return true;
        } catch (error: any) {
            if (error instanceof UnauthorizedException) {
                throw error;
            }

            if (error?.response?.status === 401) {
                this.logger.error('Session validation returned 401');
                throw new UnauthorizedException('Invalid or expired session');
            }

            if (error?.code === 'ECONNREFUSED') {
                this.logger.error('Auth service unavailable');
                throw new UnauthorizedException('Authentication service unavailable');
            }

            this.logger.error('Session validation failed', error?.response?.data || error.message);
            throw new UnauthorizedException('Authentication failed');
        }
    }
}
