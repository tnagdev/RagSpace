import 'dotenv/config';
import { betterAuth } from "better-auth";
import type { BetterAuthOptions } from "better-auth";
import { PrismaClient } from "@prisma/client";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { Logger } from "@nestjs/common";

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
    adapter,
    log: ['error', 'warn'],
});

const authConfig = {
    trustedOrigins: ["http://localhost:8000", "http://localhost:8001", "http://localhost:3000"],
    database: prismaAdapter(prisma, {
        provider: "postgresql",
    }),
    secret: process.env.BETTER_AUTH_SECRET || 'default_secret_key',
    emailAndPassword: {
        enabled: true,
        autoSignIn: true,
    },
    user: {
        additionalFields: {
            username: {
                type: "string",
                required: false,
                unique: true,
                input: true,
            }
        }
    },
    socialProviders: {
        google: {
            clientId: "253583722822-b4omr6cuehk90gustvnf6sq4p9mcen4e.apps.googleusercontent.com",
            clientSecret: "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",
            scope: ["openid", "email", "profile"],
            prompt: "select_account",
            redirectURI: "http://localhost:8001/auth/google/callback"
        }
    },
    session: {
        cookieCache: {
            enabled: true,
            maxAge: 300,
        },
    },
    advanced: {
        useSecureCookies: false,
        crossSubDomainCookies: {
            enabled: false,
        },
        disableCSRFCheck: true,
        disableOriginCheck: true,
    }
} satisfies BetterAuthOptions;

export const auth: ReturnType<typeof betterAuth> = betterAuth(authConfig);
