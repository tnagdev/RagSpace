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

@Injectable()
export class AuthGuard implements CanActivate {
    private readonly logger = new Logger(AuthGuard.name);
    private publicRoutes: string[] = [
        '/api/auth/signup',
        '/api/auth/signin',
        '/api/auth/google',
        '/api/auth/health',
        '/api/webhooks/lemon-squeezy',
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

        if (this.publicRoutes.includes(context.switchToHttp().getRequest<Request>().path)) {
            return true;
        }

        const request = context.switchToHttp().getRequest<Request>();
        try {
            const authServiceUrl = SERVICES.AUTH_SERVICE.url;
            const authHeaders = {
                cookie: request.headers.cookie || '',
                'user-agent': request.headers['user-agent'] || '',
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
            request['user'] = sessionData.user;
            request['session'] = sessionData.session;
            return true;
        } catch (error) {
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
