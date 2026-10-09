import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { FieldError, problem, PROBLEM_CONTENT_TYPE } from '@ragspace/shared-ts';
import type { ValidationError } from 'class-validator';
import type { Response } from 'express';
import { logger } from './logger';

export function validationException(errors: ValidationError[]): BadRequestException {
    const fieldErrors: FieldError[] = errors.map((error) => ({
        field: error.property,
        message: Object.values(error.constraints ?? {})[0] ?? 'is invalid',
    }));
    return new BadRequestException({ message: 'One or more fields are invalid', errors: fieldErrors });
}

@Catch()
export class ProblemFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost): void {
        const res = host.switchToHttp().getResponse<Response>();
        if (res.headersSent) return;

        if (exception instanceof HttpException) {
            const status = exception.getStatus();
            const response = exception.getResponse() as string | { message?: string | string[]; errors?: FieldError[] };
            const detail = typeof response === 'string' ? response : [response.message].flat().join('; ');
            const errors = typeof response === 'object' ? response.errors : undefined;
            res.status(status).type(PROBLEM_CONTENT_TYPE).json(problem(status, undefined, detail, errors ? { errors } : {}));
            return;
        }

        logger.error('Unhandled exception', exception, 'ProblemFilter');
        res.status(500).type(PROBLEM_CONTENT_TYPE).json(problem(500, 'internal'));
    }
}
