import { Injectable } from '@nestjs/common';
import { authV1, notFound, unauthenticated } from '@ragspace/shared-ts';
import { auth } from '../../auth';
import { eventBus } from '../events/event-bus';
import { logger } from '../logger';
import { toProtoUser, UserLike } from './user.mapper';
import { UsersService } from './users.service';

@Injectable()
export class AuthRpcService implements authV1.AuthServiceImplementation {
    constructor(private readonly users: UsersService) { }

    async validateSession(request: authV1.ValidateSessionRequest): Promise<authV1.ValidateSessionResponse> {
        const headers = new Headers();
        if (request.cookie) headers.set('cookie', request.cookie);
        if (request.authorization) headers.set('authorization', request.authorization);
        // The signed cookie cache would keep revoked or deleted sessions valid until it expires; the gateway caches instead.
        const result = await auth.api.getSession({ headers, query: { disableCookieCache: true } });
        if (!result) throw unauthenticated('No valid session');
        return {
            user: toProtoUser(result.user as UserLike),
            session: {
                id: result.session.id,
                userId: result.session.userId,
                expireTime: new Date(result.session.expiresAt),
                createTime: new Date(result.session.createdAt),
            },
        };
    }

    async getUser(request: authV1.GetUserRequest): Promise<authV1.GetUserResponse> {
        const user = await this.users.findById(request.userId);
        if (!user) throw notFound('User');
        return { user: toProtoUser(user) };
    }

    async updateUser(request: authV1.UpdateUserRequest): Promise<authV1.UpdateUserResponse> {
        const user = await this.users.update(request.userId, {
            ...(request.name !== undefined ? { name: request.name } : {}),
            ...(request.username !== undefined ? { username: request.username || null } : {}),
        });
        return { user: toProtoUser(user) };
    }

    async deleteUser(request: authV1.DeleteUserRequest): Promise<authV1.DeleteUserResponse> {
        const deleted = await this.users.delete(request.userId);
        if (!deleted) throw notFound('User');
        try {
            await eventBus.publish({ $case: 'userDeleted', userDeleted: { userId: request.userId } });
        } catch (error) {
            logger.error(`user.deleted publish failed for ${request.userId}; data purge needs a manual replay`, error, 'AuthRpc');
            throw error;
        }
        return {};
    }
}
