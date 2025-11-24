import { betterAuth } from "better-auth";
import type { BetterAuthOptions } from "better-auth";
import { PrismaClient } from "@prisma/client";
import { prismaAdapter } from "better-auth/adapters/prisma";

const prisma = new PrismaClient();

const authConfig = {
    trustedOrigins: ["http://localhost:8000", "http://localhost:8001"],
    database: prismaAdapter(prisma, {
        provider: "postgresql",
    }),
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
            clientId: "584784281382-pkl3nt5ork93dc0ipco9hupqpvmj5b4n.apps.googleusercontent.com",
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
