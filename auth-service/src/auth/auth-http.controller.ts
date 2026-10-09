import {
    BadRequestException,
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    Post,
    Query,
    Req,
    Res,
    UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../../auth';
import { logger } from '../logger';
import { copyCookies, ensureOk, readJson } from './better-auth.response';
import { ChangePasswordDto, ForgotPasswordDto, OAuthStartQueryDto, ResetPasswordDto, SignInDto, SignUpDto } from './dto';
import { toPublicUser, UserLike } from './user.mapper';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const OAUTH_PROVIDERS = new Set(['google']);

@Controller('api/v1/auth')
export class AuthHttpController {
    @Post('sign-up')
    async signUp(@Body() dto: SignUpDto, @Req() req: Request, @Res() res: Response) {
        const response = await auth.api.signUpEmail({
            body: { name: dto.name, email: dto.email, password: dto.password },
            headers: fromNodeHeaders(req.headers),
            asResponse: true,
        });
        await ensureOk(response);
        const data = await readJson<{ user: UserLike }>(response);
        copyCookies(response, res);
        res.status(201).location('/api/v1/me').json({ user: toPublicUser(data.user) });
    }

    @Post('sign-in')
    async signIn(@Body() dto: SignInDto, @Req() req: Request, @Res() res: Response) {
        const response = await auth.api.signInEmail({
            body: { email: dto.email, password: dto.password },
            headers: fromNodeHeaders(req.headers),
            asResponse: true,
        });
        if (response.status === 401) throw new UnauthorizedException('Invalid email or password');
        await ensureOk(response);
        const data = await readJson<{ user: UserLike }>(response);
        copyCookies(response, res);
        res.status(200).json({ user: toPublicUser(data.user) });
    }

    @Post('sign-out')
    async signOut(@Req() req: Request, @Res() res: Response) {
        const response = await auth.api.signOut({ headers: fromNodeHeaders(req.headers), asResponse: true });
        copyCookies(response, res);
        res.status(204).end();
    }

    @Get('oauth/:provider')
    async startOAuth(
        @Param('provider') provider: string,
        @Query() query: OAuthStartQueryDto,
        @Req() req: Request,
        @Res() res: Response,
    ) {
        if (!OAUTH_PROVIDERS.has(provider)) throw new BadRequestException(`Unsupported provider: ${provider}`);
        const response = await auth.api.signInSocial({
            body: {
                provider: provider as 'google',
                callbackURL: `${FRONTEND_URL}${query.redirectTo ?? '/'}`,
                errorCallbackURL: `${FRONTEND_URL}/auth/login?error=oauth_failed`,
            },
            headers: fromNodeHeaders(req.headers),
            asResponse: true,
        });
        await ensureOk(response);
        const location = response.headers.get('location') ?? (await readJson<{ url?: string }>(response)).url;
        if (!location) throw new BadRequestException('Provider did not return an authorization URL');
        copyCookies(response, res);
        res.redirect(302, location);
    }

    @Post('password/forgot')
    @HttpCode(202)
    async requestPasswordReset(@Body() dto: ForgotPasswordDto): Promise<void> {
        try {
            await auth.api.requestPasswordReset({
                body: { email: dto.email, redirectTo: `${FRONTEND_URL}/auth/reset-password` },
            });
        } catch (error) {
            logger.warn(`Password reset request failed: ${String(error)}`, 'AuthHttp');
        }
    }

    @Post('password/reset')
    @HttpCode(204)
    async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
        try {
            await auth.api.resetPassword({ body: { token: dto.token, newPassword: dto.newPassword } });
        } catch {
            throw new BadRequestException('Invalid or expired reset token');
        }
    }

    @Post('password/change')
    async changePassword(@Body() dto: ChangePasswordDto, @Req() req: Request, @Res() res: Response) {
        const response = await auth.api.changePassword({
            body: {
                currentPassword: dto.currentPassword,
                newPassword: dto.newPassword,
                revokeOtherSessions: dto.revokeOtherSessions ?? true,
            },
            headers: fromNodeHeaders(req.headers),
            asResponse: true,
        });
        if (response.status === 401) throw new UnauthorizedException();
        if (!response.ok) throw new BadRequestException('Current password is incorrect');
        copyCookies(response, res);
        res.status(204).end();
    }
}
