import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthUser, AuthSession } from '@ragspace/shared-ts';

export type { AuthUser, AuthSession };

export const CurrentUser = createParamDecorator(
    (data: unknown, ctx: ExecutionContext): AuthUser => {
        const request = ctx.switchToHttp().getRequest();
        return request.user;
    },
);

export const CurrentSession = createParamDecorator(
    (data: unknown, ctx: ExecutionContext): AuthSession => {
        const request = ctx.switchToHttp().getRequest();
        return request.session;
    },
);
