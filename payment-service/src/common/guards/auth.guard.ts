import {
    Injectable,
    CanActivate,
    ExecutionContext,
    UnauthorizedException,
    Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
    private readonly logger = new Logger(AuthGuard.name);

    constructor(private reflector: Reflector) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        const request = context.switchToHttp().getRequest<Request>();

        if (isPublic) {
            const userHeader = request.headers['x-user'] as string;
            const sessionHeader = request.headers['x-session'] as string;
            if (userHeader) {
                try {
                    request['user'] = JSON.parse(userHeader);
                    if (sessionHeader) request['session'] = JSON.parse(sessionHeader);
                } catch {
                    // Ignore parse errors on public routes
                }
            }
            return true;
        }


        const userHeader = request.headers['x-user'] as string;
        const sessionHeader = request.headers['x-session'] as string;
        const serviceHeader = request.headers['x-service'] as string;

        // Inter-service call with service header
        if (serviceHeader && userHeader) {
            try {
                const user = JSON.parse(userHeader);

                if (!user.id) {
                    this.logger.warn('Invalid user data from inter-service call');
                    throw new UnauthorizedException('Invalid authentication data');
                }

                request['user'] = user;
                request['session'] = sessionHeader ? JSON.parse(sessionHeader) : null;

                this.logger.debug(
                    `Inter-service request from ${serviceHeader} for user ${user.id}`,
                );
                return true;
            } catch (error) {
                if (error instanceof UnauthorizedException) {
                    throw error;
                }
                this.logger.error(
                    'Failed to parse inter-service headers',
                    error.message,
                );
                throw new UnauthorizedException('Invalid inter-service headers');
            }
        }

        // API Gateway forwarded request
        if (userHeader && sessionHeader) {
            try {
                const user = JSON.parse(userHeader);
                const session = JSON.parse(sessionHeader);

                if (!user.id || !user.email) {
                    this.logger.warn('Invalid user data from API Gateway');
                    throw new UnauthorizedException('Invalid authentication data');
                }

                if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
                    this.logger.warn('Expired session from API Gateway');
                    throw new UnauthorizedException('Session expired');
                }

                request['user'] = user;
                request['session'] = session;

                this.logger.debug(`Authenticated request for user ${user.id}`);
                return true;
            } catch (error) {
                if (error instanceof UnauthorizedException) {
                    throw error;
                }
                this.logger.error('Failed to parse headers', error.message);
                throw new UnauthorizedException('Invalid authentication headers');
            }
        }

        this.logger.warn('No authentication headers found');
        throw new UnauthorizedException('Authentication required');
    }
}
