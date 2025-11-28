import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
    private readonly logger = new Logger(AuthGuard.name);
    constructor(private reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (isPublic) return true;

        const request = context.switchToHttp().getRequest();
        const userHeader = request.headers['x-user'] as string;
        const sessionHeader = request.headers['x-session'] as string;

        if (userHeader && sessionHeader) {
            try {
                request.user = JSON.parse(userHeader);
                request.session = JSON.parse(sessionHeader);
                return true;
            } catch (error) {
                throw new UnauthorizedException('Invalid authentication headers');
            }
        }

        throw new UnauthorizedException('Authentication required');
    }
}
