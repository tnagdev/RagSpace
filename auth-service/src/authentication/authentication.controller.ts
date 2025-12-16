import { Controller, Get, Logger, Req, Res, Post, Body } from '@nestjs/common';
import type { Request, Response } from 'express';
import { auth } from '../../auth';
import { AuthenticationService } from './authentication.service';
import { SignInDto, SignUpDto } from './dto';
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
            const result = await auth.api.signInSocial({
                body: {
                    provider: 'google',
                },
                asResponse: true,
            });

            if (result) {
                res.setHeaders(result.headers);
                const data = await result.json();
                return res.json(data);
            }

            return res.status(400).json({ error: 'Failed to initiate Google login' });
        } catch (error) {
            this.logger.error('Error in Google login:', error);
            return res.status(500).json({ error: 'Internal server error', details: error.message });
        }
    }

    @Public()
    @Get('/google/callback')
    async googleCallback(@Req() req: Request, @Res() res: Response) {
        try {
            const url = new URL(`http://localhost:8001/better-auth/callback/google`);
            url.search = new URLSearchParams(req.query as any).toString();
            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'cookie': req.headers.cookie || '',
                },
                redirect: 'manual',
            });
            res.setHeaders(response.headers);
            if (response.status === 302 || response.status === 301) {
                const location = response.headers.get('location');
                return res.json({
                    success: true,
                    message: 'Authentication successful',
                    redirect: location
                });
            }

            const contentType = response.headers.get('content-type');
            if (contentType?.includes('application/json')) {
                const data = await response.json();
                return res.json(data);
            }

            const text = await response.text();
            return res.status(response.status).send(text);
        } catch (error) {
            this.logger.error('Error in Google callback:', error);
            return res.status(500).json({ error: 'Authentication failed', details: error.message });
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
}
