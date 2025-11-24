import {
    Controller,
    All,
    Req,
    Res,
    HttpException,
    HttpStatus,
    Logger
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ProxyService } from './proxy.service';

@Controller()
export class ProxyController {
    private readonly logger = new Logger(ProxyController.name);

    constructor(private readonly proxyService: ProxyService) { }

    @All('*')
    async handleRequest(@Req() req: Request, @Res() res: Response) {
        const path = req.path;
        if (path.startsWith('/api/health')) {
            return res.json({ status: 'ok' });
        }

        const serviceName = this.proxyService.getServiceForRoute(path);
        if (!serviceName) {
            throw new HttpException(
                `No service configured for route: ${path}`,
                HttpStatus.NOT_FOUND,
            );
        }

        const result = await this.proxyService.forwardRequest(
            serviceName,
            path,
            req.method,
            req.body,
            req.headers,
            req.query,
        );

        for (const [key, value] of Object.entries(result.headers || {})) {
            res.setHeader(key, value as string);
        }

        if (result?.data?.redirect && result?.data?.url) {
            return res.status(result.status).redirect(result.data.url);
        }

        return res.status(result.status).send(result.data);
    }
}
