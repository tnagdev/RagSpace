import { Controller, Get, Logger, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AllowAnonymous, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { auth } from '../../auth';

@Controller('/')
export class AuthenticationController {
    private readonly logger = new Logger(AuthenticationController.name);

    @Get('/google/login')
    @AllowAnonymous()
    async googleLogin(@Req() req: Request, @Res() res: Response) {
        try {
            const headers: HeadersInit = [];
            for (const [key, value] of Object.entries(req.headers)) {
                headers.push([key, value?.toString().replaceAll('\"', '') || '']);
            }

            console.log('Request headers:', headers);
            const result = await auth.api.signInSocial({
                body: {
                    provider: 'google',
                },
                headers: headers,
                returnHeaders: true
            });

            if (result) {
                for (const [key, value] of Object.entries(result.headers)) {
                    res.setHeader(key, value);
                }
                return res.send(result.response);
            }

            return res.status(400).json({ error: 'Failed to generate OAuth URL' });
        } catch (error) {
            this.logger.error('Error in Google login:', error);
            return res.status(500).json({ error: 'Internal server error', details: error.message });
        }
    }

    @Get('/me')
    async getProfile(@Session() session: UserSession) {
        return { user: session.user };
    }
}
