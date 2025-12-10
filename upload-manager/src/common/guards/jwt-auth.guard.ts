import {
    Injectable,
    CanActivate,
    ExecutionContext,
    UnauthorizedException,
    Logger,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class JwtAuthGuard implements CanActivate {
    private readonly logger = new Logger(JwtAuthGuard.name);


    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<Request>();
        const userHeader = request.headers['x-user'] as string;
        const sessionHeader = request.headers['x-session'] as string;
        const serviceHeader = request.headers['x-service'] as string;

        // Allow inter-service communication with x-service and x-user headers
        if (serviceHeader && userHeader) {
            try {
                const user = JSON.parse(userHeader);

                if (!user.id) {
                    this.logger.warn('Invalid user data from inter-service call');
                    throw new UnauthorizedException('Invalid authentication data');
                }

                request['user'] = user;
                request['session'] = sessionHeader ? JSON.parse(sessionHeader) : null;

                this.logger.debug(`Inter-service request from ${serviceHeader} for user ${user.id}`);
                return true;
            } catch (error) {
                if (error instanceof UnauthorizedException) {
                    throw error;
                }
                this.logger.error('Failed to parse inter-service headers', error.message);
                throw new UnauthorizedException('Invalid inter-service headers');
            }
        }

        // Standard API Gateway authentication
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

                return true;
            } catch (error) {
                if (error instanceof UnauthorizedException) {
                    throw error;
                }
                this.logger.error('Failed to parse user/session headers', error.message);
                throw new UnauthorizedException('Invalid authentication headers');
            }
        }

        this.logger.warn('Direct request without API Gateway headers');
        throw new UnauthorizedException('Please use API Gateway for authentication');
    }
}
