import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthUser {
    id: string;
    email: string;
    username?: string;
    name?: string;
    emailVerified?: boolean;
    image?: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface AuthSession {
    id: string;
    token: string;
    userId: string;
    expiresAt: string;
    ipAddress?: string;
    userAgent?: string;
}

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
