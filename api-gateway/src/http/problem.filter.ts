import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import type { Response } from 'express';
import { problem } from '@ragspace/shared-ts';
import { logger } from '../logger';
import { sendProblem, toProblem } from './problem';

@Catch()
export class ProblemFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost): void {
        const res = host.switchToHttp().getResponse<Response>();
        const body =
            exception instanceof HttpException ? problem(exception.getStatus(), undefined, exception.message) : toProblem(exception);
        if (body.status >= 500) logger.error(`Request failed: ${String(exception)}`, (exception as Error)?.stack, 'ProblemFilter');
        sendProblem(res, body);
    }
}
