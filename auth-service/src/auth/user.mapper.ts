import type { authV1 } from '@ragspace/shared-ts';

export interface UserLike {
    id: string;
    email: string;
    name: string;
    username?: string | null;
    image?: string | null;
    emailVerified: boolean;
    createdAt: Date | string;
    updatedAt: Date | string;
}

export interface PublicUser {
    id: string;
    email: string;
    name: string;
    username: string | null;
    imageUrl: string | null;
    emailVerified: boolean;
    createdAt: string;
    updatedAt: string;
}

export function toPublicUser(user: UserLike): PublicUser {
    return {
        id: user.id,
        email: user.email,
        name: user.name,
        username: user.username ?? null,
        imageUrl: user.image ?? null,
        emailVerified: user.emailVerified,
        createdAt: new Date(user.createdAt).toISOString(),
        updatedAt: new Date(user.updatedAt).toISOString(),
    };
}

export function toProtoUser(user: UserLike): authV1.User {
    return {
        id: user.id,
        email: user.email,
        name: user.name,
        username: user.username ?? undefined,
        imageUrl: user.image ?? undefined,
        emailVerified: user.emailVerified,
        createTime: new Date(user.createdAt),
        updateTime: new Date(user.updatedAt),
    };
}
