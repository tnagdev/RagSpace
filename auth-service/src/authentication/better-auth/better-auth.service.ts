import { Injectable, Logger } from '@nestjs/common';
import { betterAuth } from "better-auth";
import { auth } from 'auth';
import type { Request, Response } from 'express';
import { toNodeHandler } from "better-auth/node";

@Injectable()
export class BetterAuthService {
    private readonly logger = new Logger(BetterAuthService.name);
    public auth: ReturnType<typeof betterAuth>;
    private handler: ReturnType<typeof toNodeHandler>;

    constructor() {
        this.auth = auth;
        this.handler = toNodeHandler(this.auth);
    }

    async googleLogin(req: Request, res: Response) {
        return await this.auth.api.signInSocial({ body: { provider: 'google' } });
    }

    async handleRequest(req: Request, res: Response) {
        return this.handler(req, res);
    }
}
