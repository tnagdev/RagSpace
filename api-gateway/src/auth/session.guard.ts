import { CanActivate, ExecutionContext, Injectable, SetMetadata, createParamDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { unauthenticated } from '../http/problem';
import { SessionService, SessionUser } from './session.service';

const PUBLIC = 'isPublic';

// Public routes still resolve the session when a cookie is present, so they can personalise the response.
export const Public = () => SetMetadata(PUBLIC, true);

type SessionRequest = Request & { user?: SessionUser | null };

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
    return context.switchToHttp().getRequest<SessionRequest>().user ?? null;
});

@Injectable()
export class SessionGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly sessions: SessionService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<SessionRequest>();
        const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC, [context.getHandler(), context.getClass()]);
        if (isPublic) {
            request.user = await this.sessions.resolve(request.headers.cookie).catch(() => null);
            return true;
        }
        request.user = await this.sessions.resolve(request.headers.cookie);
        if (!request.user) throw unauthenticated();
        return true;
    }
}
