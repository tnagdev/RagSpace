import { Body, Controller, Delete, Get, HttpCode, Inject, Patch, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/session.guard';
import { clearSessionCookies } from '../auth/session-cookie';
import { SessionService } from '../auth/session.service';
import type { SessionUser } from '../auth/session.service';
import { config } from '../config';
import { forbidden } from '../http/problem';
import * as map from '../mappers';
import { AUTH } from '../rpc/clients';
import type { AuthClient } from '../rpc/clients';

interface UpdateMeBody {
    name?: string;
    username?: string | null;
}

@Controller('me')
export class AccountController {
    constructor(
        @Inject(AUTH) private readonly auth: AuthClient,
        private readonly sessions: SessionService,
    ) {}

    @Get()
    get(@CurrentUser() user: SessionUser) {
        return map.user(user.profile);
    }

    @Patch()
    async update(@CurrentUser() user: SessionUser, @Body() body: UpdateMeBody, @Req() req: Request) {
        const response = await this.auth.updateUser({
            userId: user.id,
            name: body.name,
            username: body.username === null ? '' : body.username,
        });
        this.sessions.evict(req.headers.cookie);
        return map.user(response.user);
    }

    @Delete()
    @HttpCode(202)
    async remove(@CurrentUser() user: SessionUser, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
        const signedInAt = user.sessionCreatedAt?.getTime() ?? 0;
        if (Date.now() - signedInAt > config.freshSessionMs) {
            throw forbidden('Sign in again to delete your account');
        }
        await this.auth.deleteUser({ userId: user.id });
        this.sessions.evict(req.headers.cookie);
        res.setHeader('Set-Cookie', clearSessionCookies(req.secure));
    }
}
