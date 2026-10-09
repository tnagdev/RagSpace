import { Inject, Injectable } from '@nestjs/common';
import { Status, authV1, rpcErrorInfo } from '@ragspace/shared-ts';
import { config } from '../config';
import type { AuthClient } from '../rpc/clients';
import { AUTH } from '../rpc/clients';
import { sessionToken } from './session-cookie';

export interface SessionUser {
    id: string;
    email: string;
    name: string;
    sessionCreatedAt: Date | undefined;
    token: string;
    profile: authV1.User;
}

interface Entry {
    user: SessionUser | null;
    expiresAt: number;
}

const NEGATIVE_TTL_MS = 5_000;
const MAX_ENTRIES = 10_000;

@Injectable()
export class SessionService {
    private readonly cache = new Map<string, Entry>();

    constructor(@Inject(AUTH) private readonly auth: AuthClient) {}

    async resolve(cookieHeader: string | undefined): Promise<SessionUser | null> {
        const token = sessionToken(cookieHeader);
        if (!token) return null;
        const cached = this.cache.get(token);
        if (cached && cached.expiresAt > Date.now()) return cached.user;

        let user: SessionUser | null = null;
        try {
            const response = await this.auth.validateSession({ cookie: cookieHeader ?? '', authorization: '' });
            user = toSessionUser(response, token);
        } catch (error) {
            if (rpcErrorInfo(error)?.status !== Status.UNAUTHENTICATED) throw error;
        }
        this.remember(token, user);
        return user;
    }

    evict(cookieHeader: string | undefined): void {
        const token = sessionToken(cookieHeader);
        if (token) this.cache.delete(token);
    }

    private remember(token: string, user: SessionUser | null): void {
        if (this.cache.size >= MAX_ENTRIES) {
            const oldest = this.cache.keys().next().value;
            if (oldest !== undefined) this.cache.delete(oldest);
        }
        this.cache.set(token, { user, expiresAt: Date.now() + (user ? config.sessionCacheMs : NEGATIVE_TTL_MS) });
    }
}

function toSessionUser(response: authV1.ValidateSessionResponse, token: string): SessionUser | null {
    if (!response.user) return null;
    return {
        id: response.user.id,
        email: response.user.email,
        name: response.user.name,
        sessionCreatedAt: response.session?.createTime,
        token,
        profile: response.user,
    };
}
