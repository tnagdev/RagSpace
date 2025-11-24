import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuthenticatedRequest extends Request {
    user?: any;
    session?: any;
}

@Injectable()
export class AuthMiddleware implements NestMiddleware {
    private readonly logger = new Logger(AuthMiddleware.name);

    constructor(private prisma: PrismaService) { }

    async use(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.substring(7);
                const existingCookie = req.headers.cookie || '';
                const betterAuthCookie = `better-auth.session_token=${token}`;
                req.headers.cookie = existingCookie ? `${existingCookie}; ${betterAuthCookie}` : betterAuthCookie;
            }

            const sessionToken = this.extractSessionToken(req.headers.cookie);
            if (sessionToken) {
                const session = await this.prisma.session.findUnique({
                    where: { token: sessionToken },
                });

                if (session && session.expiresAt > new Date()) {
                    const user = await this.prisma.user.findUnique({
                        where: { id: session.userId },
                    });
                    if (user) {
                        req.user = user;
                        req.session = session;
                    }
                }
            }
        } catch (error) {
            this.logger.error('Session validation error:', error);
        }

        next();
    }

    private extractSessionToken(cookie: string | undefined): string | null {
        if (!cookie) return null;
        const match = cookie.match(/better-auth\.session_token=([^;]+)/);
        return match ? match[1] : null;
    }
}
