import 'dotenv/config';
import { betterAuth } from 'better-auth';
import type { BetterAuthOptions } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { sendPasswordResetEmail } from './src/email/email.service';
import { eventBus } from './src/events/event-bus';

export const AUTH_BASE_PATH = '/api/v1/auth';

function requiredEnv(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is not set`);
    return value;
}

const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

const prisma = new PrismaClient({
    adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
    log: ['error', 'warn'],
});

const trustedOrigins = (process.env.TRUSTED_ORIGINS || frontendUrl).split(',').map((origin) => origin.trim());

const authConfig = {
    baseURL: process.env.BETTER_AUTH_URL || frontendUrl,
    basePath: AUTH_BASE_PATH,
    trustedOrigins,
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    secret: requiredEnv('BETTER_AUTH_SECRET'),
    emailAndPassword: {
        enabled: true,
        autoSignIn: true,
        resetPasswordTokenExpiresIn: 3600,
        revokeSessionsOnPasswordReset: true,
        sendResetPassword: async ({ user, token }) => {
            await sendPasswordResetEmail(user.email, `${frontendUrl}/auth/reset-password?token=${encodeURIComponent(token)}`);
        },
    },
    user: {
        additionalFields: {
            username: { type: 'string', required: false, unique: true, input: true },
        },
    },
    socialProviders: {
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID as string,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
            scope: ['openid', 'email', 'profile'],
            prompt: 'select_account',
            redirectURI: process.env.GOOGLE_REDIRECT_URI || `${frontendUrl}${AUTH_BASE_PATH}/oauth/google/callback`,
        },
    },
    session: {
        cookieCache: { enabled: true, maxAge: 300 },
    },
    databaseHooks: {
        user: {
            create: {
                after: async (user) => {
                    await eventBus.publish({
                        $case: 'userCreated',
                        userCreated: { userId: user.id, email: user.email, name: user.name },
                    });
                },
            },
        },
    },
    advanced: {
        useSecureCookies: process.env.NODE_ENV === 'production',
    },
} satisfies BetterAuthOptions;

export const auth: ReturnType<typeof betterAuth> = betterAuth(authConfig);
