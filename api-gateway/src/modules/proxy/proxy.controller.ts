import {
    Controller,
    All,
    Req,
    Res,
    HttpException,
    HttpStatus,
    Logger,
    UseInterceptors,
    UploadedFiles,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import 'multer';
import { randomUUID } from 'crypto';
import { ProxyService } from './proxy.service';

@Controller()
export class ProxyController {
    private readonly logger = new Logger(ProxyController.name);

    constructor(private readonly proxyService: ProxyService) { }

    @All('*')
    @UseInterceptors(AnyFilesInterceptor())
    async handleRequest(
        @Req() req: Request,
        @Res() res: Response,
        @UploadedFiles() files?: Array<Express.Multer.File>,
    ) {
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

        const filesObj = files?.reduce((acc, file) => {
            if (!acc[file.fieldname]) {
                acc[file.fieldname] = [];
            }
            acc[file.fieldname].push(file);
            return acc;
        }, {} as Record<string, Express.Multer.File[]>);

        const enrichedHeaders = { ...req.headers };

        // Correlation ID — generate if not present, always forward
        const correlationId = (req.headers['x-correlation-id'] as string) || randomUUID();
        enrichedHeaders['x-correlation-id'] = correlationId;

        if (req['user']) {
            const user = req['user'];
            enrichedHeaders['x-user'] = JSON.stringify(user);
            enrichedHeaders['x-user-id'] = user.id ?? '';
            enrichedHeaders['x-user-email'] = user.email ?? '';
            enrichedHeaders['x-user-name'] = (user as any).name ?? (user as any).username ?? '';
        }

        if (req['session']) {
            enrichedHeaders['x-session'] = JSON.stringify(req['session']);
        }

        const result = await this.proxyService.forwardRequest(
            serviceName,
            path,
            req.method,
            req.body,
            enrichedHeaders,
            req.query,
            filesObj,
        );

        if (result.headers['content-type']?.includes('text/event-stream')) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');
            if (result.data && typeof result.data.pipe === 'function') {
                result.data.pipe(res);
            } else {
                return res.status(result.status).send(result.data);
            }
            return;
        }

        res.status(result.status);
        res.setHeader('x-correlation-id', correlationId);
        for (const [key, value] of Object.entries(result.headers || {})) {
            console.log(`Response header → ${key}: ${value}`);
            if (value === undefined || value === null) continue;
            if (key.toLowerCase() === 'set-cookie') {
                res.setHeader('set-cookie', Array.isArray(value) ? value : [value]);
            } else if (!['transfer-encoding', 'content-encoding'].includes(key.toLowerCase())) {
                res.setHeader(key, value as string);
            }
        }

        if (result?.data?.redirect && result?.data?.url) {
            return res.redirect(302, result.data.url);
        }

        return res.send(result.data);
    }
}
