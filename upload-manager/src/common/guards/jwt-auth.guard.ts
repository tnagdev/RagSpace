import {
    Injectable,
    CanActivate,
    ExecutionContext,
    UnauthorizedException,
    Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class JwtAuthGuard implements CanActivate {
    private readonly logger = new Logger(JwtAuthGuard.name);

    constructor(
        private configService: ConfigService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<Request>();

        // Check if request is coming from API Gateway with validated session
        const userHeader = request.headers['x-user'] as string;
        const sessionHeader = request.headers['x-session'] as string;

        if (userHeader && sessionHeader) {
            try {
                // Parse user and session from API Gateway
                const user = JSON.parse(userHeader);
                const session = JSON.parse(sessionHeader);

                // Validate required user fields
                if (!user.id || !user.email) {
                    this.logger.warn('Invalid user data from API Gateway');
                    throw new UnauthorizedException('Invalid authentication data');
                }

                // Validate session is not expired
                if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
                    this.logger.warn('Expired session from API Gateway');
                    throw new UnauthorizedException('Session expired');
                }

                // Attach user and session to request
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

        // Reject direct requests - all requests must go through API Gateway
        this.logger.warn('Direct request without API Gateway headers');
        throw new UnauthorizedException('Please use API Gateway for authentication');
    }

    private extractTokenFromHeader(request: Request): string | undefined {
        const authHeader = request.headers.authorization;
        if (!authHeader) {
            return undefined;
        }

        const [type, token] = authHeader.split(' ');
        return type === 'Bearer' ? token : undefined;
    }
}
