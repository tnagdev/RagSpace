import { Controller, Get, Logger, Req, Res, Post, Body, Patch, Delete } from '@nestjs/common';
import type { Request, Response } from 'express';
import { auth } from '../../auth';
import { AuthenticationService } from './authentication.service';
import { SignInDto, SignUpDto, ChangePasswordDto, UpdateProfileDto } from './dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';

@Controller('auth')
export class AuthenticationController {
    private readonly logger = new Logger(AuthenticationController.name);

    constructor(private authService: AuthenticationService) { }

    @Public()
    @Post('/signin')
    async signIn(@Body() body: SignInDto, @Req() req: Request, @Res() res: Response) {
        try {
            const { emailOrUsername, password } = body;
            const isEmail = emailOrUsername.includes('@');
            let email = emailOrUsername;
            if (!isEmail) {
                const user = await this.authService.findUserByUsername(emailOrUsername);
                if (!user) {
                    return res.status(401).json({ error: 'Invalid credentials' });
                }
                email = user.email;
            }

            const result = await auth.api.signInEmail({
                body: {
                    email: email,
                    password: password,
                },
                asResponse: true,
            });

            if (!result) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            return res.setHeaders(result.headers).json(await result.json());
        } catch (error) {
            this.logger.error('Error in sign in:', error);
            return res.status(500).json({ error: 'Internal server error', details: error.message });
        }
    }

    @Public()
    @Post('/signup')
    async signUp(@Body() body: SignUpDto, @Req() req: Request, @Res() res: Response) {

        try {
            const { email, username, password, firstName, lastName } = body;
            const finalUsername = username || email.split('@')[0];

            const existingUser = await this.authService.findUserByUsername(finalUsername);
            if (existingUser) {
                return res.status(400).json({ error: 'Username already taken' });
            }

            const result = await auth.api.signUpEmail({
                body: {
                    email: email,
                    password: password,
                    name: [firstName, lastName].filter(Boolean).join(' '),
                },
                asResponse: true,
            });

            if (result) {
                res.setHeaders(result.headers);
                const data = await result.json();
                if (data.user && data.user.id) {
                    await this.authService.updateUserUsername(data.user.id, finalUsername);
                    await this.authService.createFreeSubscription(data.user.id);
                }
                return res.json(data);
            }

            return res.status(400).json({ error: 'Failed to create account' });
        } catch (error) {
            this.logger.error('Error in sign up:', error);
            return res.status(500).json({ error: 'Internal server error', details: error.message });
        }
    }

    @Public()
    @Get('/google/login')
    async googleLogin(@Req() req: Request, @Res() res: Response) {
        try {
            const callbackURL = (req.query.callbackURL as string) ||
                `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/callback`;

            const result = await auth.api.signInSocial({
                body: {
                    provider: 'google',
                    callbackURL,
                },
                asResponse: true,
            });

            if (!result) {
                return res.status(400).json({ error: 'Failed to initiate Google login' });
            }

            // better-auth returns a 302 with the Google OAuth URL in the Location header
            if (result.status === 302 || result.status === 301) {
                const url = result.headers.get('location');
                if (url) {
                    const setCookies = (result.headers as any).getSetCookie?.() ||
                        [result.headers.get('set-cookie')].filter(Boolean) as string[];
                    if (setCookies.length > 0) {
                        res.setHeader('Set-Cookie', setCookies);
                    }
                    return res.status(200).json({ redirect: true, url });
                }
            }

            // Fallback: better-auth may return JSON with a url field
            let data: any;
            try { data = await result.json(); } catch { /* ignore */ }
            if (data?.url) {
                const setCookies = (result.headers as any).getSetCookie?.() ||
                    [result.headers.get('set-cookie')].filter(Boolean) as string[];
                if (setCookies.length > 0) {
                    res.setHeader('Set-Cookie', setCookies);
                }
                return res.status(200).json({ redirect: true, url: data.url });
            }

            return res.status(400).json({ error: 'Failed to get Google OAuth URL' });
        } catch (error) {
            this.logger.error('Error in Google login:', error);
            return res.status(500).json({ error: 'Internal server error', details: error.message });
        }
    }

    @Public()
    @Get('/google/callback')
    async googleCallback(@Req() req: Request, @Res() res: Response) {
        try {
            const selfPort = process.env.PORT || '8001';
            const url = new URL(`http://localhost:${selfPort}/api/auth/callback/google`);
            url.search = new URLSearchParams(req.query as any).toString();

            this.logger.log(`Proxying Google callback to better-auth: ${url.toString()}`);

            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'cookie': req.headers.cookie || '',
                    'user-agent': req.headers['user-agent'] || '',
                    'accept': 'text/html,application/xhtml+xml,*/*',
                },
                redirect: 'manual',
            });

            this.logger.log(`better-auth callback response: ${response.status}`);

            // Forward ALL Set-Cookie headers (session + state-cleanup cookies)
            const setCookies = response.headers.getSetCookie?.() ||
                [response.headers.get('set-cookie')].filter(Boolean) as string[];
            if (setCookies.length > 0) {
                res.setHeader('Set-Cookie', setCookies);
            }

            if (response.status === 302 || response.status === 301) {
                const cookieHeader = setCookies.map(c => c.split(';')[0]).join('; ');
                try {
                    const session = await auth.api.getSession({
                        headers: { cookie: cookieHeader } as any,
                    });
                    if (session?.user?.id) {
                        await this.authService.createFreeSubscription(session.user.id);
                        this.logger.log(`Ensured free subscription for OAuth user ${session.user.id}`);
                    }
                } catch (err) {
                    this.logger.warn('Could not ensure subscription after OAuth:', err?.message);
                }

                const location = response.headers.get('location');
                this.logger.log(`Redirecting to: ${location}`);
                return res.status(200).json({
                    redirect: true,
                    url: location || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/callback`,
                });
            }

            // better-auth returned an error response — surface it for debugging
            const contentType = response.headers.get('content-type');
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
            if (contentType?.includes('application/json')) {
                const data = await response.json();
                this.logger.error('better-auth callback error response:', data);
                const message = encodeURIComponent(data?.message || data?.error || 'oauth_failed');
                return res.status(200).json({ redirect: true, url: `${frontendUrl}/auth/login?error=${message}` });
            }

            const text = await response.text();
            this.logger.error(`better-auth callback non-redirect response (${response.status}):`, text.slice(0, 200));
            return res.status(200).json({ redirect: true, url: `${frontendUrl}/auth/login?error=oauth_failed` });
        } catch (error) {
            this.logger.error('Error in Google callback:', error);
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
            return res.status(200).json({ redirect: true, url: `${frontendUrl}/auth/login?error=oauth_failed` });
        }
    }

    @Get('/me')
    async getProfile(@CurrentUser() user: any, @Res() res: Response) {
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        return res.json({ user });
    }

    @Public()
    @Get('/session')
    async getSession(@Req() req: Request, @Res() res: Response) {
        try {
            const session = await auth.api.getSession({
                headers: req.headers as any,
            });

            if (!session) {
                return res.status(401).json({ error: 'No active session' });
            }

            return res.json(session);
        } catch (error) {
            this.logger.error('Error fetching session:', error);
            return res.status(401).json({ error: 'Invalid or expired session' });
        }
    }


    @Public()
    @Get('/health')
    getHealth(@Res() res: Response) {
        return res.status(200).json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            env: process.env.NODE_ENV || 'development',
            port: Number(process.env.PORT) || 8001,
        });
    }

    @Patch('/profile')
    async updateProfile(
        @CurrentUser() user: any,
        @Body() body: UpdateProfileDto,
        @Req() req: Request,
        @Res() res: Response,
    ) {
        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        const { name, username } = body;

        if (username && username !== user.username) {
            const existing = await this.authService.findUserByUsername(username);
            if (existing && existing.id !== user.id) {
                return res.status(400).json({ error: 'Username already taken' });
            }
        }

        if (name) {
            await auth.api.updateUser({
                body: { name },
                headers: req.headers as any,
            });
        }

        if (username) {
            await this.authService.updateUserUsername(user.id, username);
        }

        const updatedUser = await this.authService.findUserById(user.id);
        return res.json({ user: updatedUser });
    }

    @Post('/change-password')
    async changePassword(
        @CurrentUser() user: any,
        @Body() body: ChangePasswordDto,
        @Req() req: Request,
        @Res() res: Response,
    ) {
        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        try {
            const result = await auth.api.changePassword({
                body: {
                    currentPassword: body.currentPassword,
                    newPassword: body.newPassword,
                    revokeOtherSessions: false,
                },
                headers: req.headers as any,
            });

            if (!result) {
                return res.status(400).json({ error: 'Failed to change password' });
            }

            return res.json({ message: 'Password changed successfully' });
        } catch (error) {
            this.logger.error('Error changing password:', error);
            const message = error?.message?.includes('incorrect') || error?.message?.includes('invalid')
                ? 'Current password is incorrect'
                : 'Failed to change password';
            return res.status(400).json({ error: message });
        }
    }

    @Public()
    @Post('/forgot-password')
    async forgotPassword(@Body() body: { email: string }, @Req() req: Request, @Res() res: Response) {
        try {
            const { email } = body;
            if (!email) {
                return res.status(400).json({ error: 'Email is required' });
            }

            const user = await this.authService.findUserByEmail(email);
            if (!user) {
                return res.status(404).json({ error: 'No account found with this email address' });
            }

            const redirectTo = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/reset-password`;
            await auth.api.forgetPassword({
                body: { email, redirectTo },
            });

            return res.json({ status: true });
        } catch (error) {
            this.logger.error('Error in forgot password:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    @Delete('/account')
    async deleteAccount(
        @CurrentUser() user: any,
        @Req() req: Request,
        @Res() res: Response,
    ) {
        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        try {
            await this.authService.deleteUserAccount(user.id, user);
            return res.json({ message: 'Account deleted successfully' });
        } catch (error) {
            this.logger.error('Error deleting account:', error);
            return res.status(500).json({ error: 'Failed to delete account', details: error.message });
        }
    }
}
