import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, catchError } from 'rxjs';
import { AxiosRequestConfig, AxiosError } from 'axios';
import { SERVICES, ServiceConfig } from '../../config/services.config';
import FormData from 'form-data';

@Injectable()
export class ProxyService {
    private readonly logger = new Logger(ProxyService.name);

    constructor(private readonly httpService: HttpService) { }

    async forwardRequest(
        serviceName: string,
        path: string,
        method: string,
        body?: any,
        headers?: any,
        query?: any,
        files?: any,
    ): Promise<any> {
        const service = this.getServiceByName(serviceName);

        if (!service) {
            throw new HttpException(
                `Service ${serviceName} not found`,
                HttpStatus.NOT_FOUND,
            );
        }

        return this.forwardToHttp(service, path, method, body, headers, query, files);
    }

    private async forwardToHttp(
        service: ServiceConfig,
        path: string,
        method: string,
        body?: any,
        headers?: any,
        query?: any,
        files?: any,
    ): Promise<any> {
        let servicePath = path.replace(/^\/api/, '');

        if (!servicePath.startsWith('/')) {
            servicePath = '/' + servicePath;
        }

        const url = `${service.url}${servicePath}`;
        this.logger.log(`Forwarding ${method} request to ${url}`);

        const sanitizedHeaders = this.sanitizeHeaders(headers);
        let requestData = body;

        // Handle file uploads with multipart/form-data
        if (files && Object.keys(files).length > 0) {
            const formData = new FormData();

            // Add files
            for (const fieldName in files) {
                const fileArray = Array.isArray(files[fieldName]) ? files[fieldName] : [files[fieldName]];
                fileArray.forEach((file: any) => {
                    formData.append(fieldName, file.buffer, {
                        filename: file.originalname,
                        contentType: file.mimetype,
                    });
                });
            }

            // Add other form fields
            if (body) {
                for (const key in body) {
                    formData.append(key, body[key]);
                }
            }

            requestData = formData;
            Object.assign(sanitizedHeaders, formData.getHeaders());
        } else if (headers['content-type'] && headers['content-type'].includes('multipart/form-data')) {
            sanitizedHeaders['content-type'] = headers['content-type'];
        } else {
            sanitizedHeaders['content-type'] = 'application/json';
        }

        const config: AxiosRequestConfig = {
            method: method.toLowerCase() as any,
            url,
            data: requestData,
            headers: sanitizedHeaders,
            params: query,
            withCredentials: true,
            timeout: 30000,
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            validateStatus: () => true, // Accept all status codes as valid
        };

        this.logger.log(`Request config for ${service.name}:`, {
            method: config.method,
            url: config.url,
            headers: config.headers,
        });

        try {
            const response = await firstValueFrom(
                this.httpService.request(config).pipe(
                    catchError((error: AxiosError) => {
                        this.logger.error(`Error forwarding request to ${service.name}:`, {
                            message: error.message,
                            code: error.code,
                            status: error.response?.status,
                        });

                        if (error.response) {
                            throw new HttpException(
                                error.response.data || 'Service error',
                                error.response.status || HttpStatus.INTERNAL_SERVER_ERROR,
                            );
                        }

                        if (error.code === 'ECONNREFUSED') {
                            throw new HttpException(
                                `Service ${service.name} is not available`,
                                HttpStatus.SERVICE_UNAVAILABLE,
                            );
                        }

                        throw new HttpException(
                            error.message || 'Service unavailable',
                            HttpStatus.SERVICE_UNAVAILABLE,
                        );
                    }),
                ),
            );

            return response;
        } catch (error: any) {
            if (error instanceof HttpException) {
                throw error;
            }
            this.logger.error(`Unexpected error forwarding request:`, error);
            throw new HttpException(
                'Internal server error',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    private getServiceByName(serviceName: string): ServiceConfig | undefined {
        return Object.values(SERVICES).find(
            (service) => service.name === serviceName,
        );
    }

    private sanitizeHeaders(headers: any): any {
        const sanitized = { ...headers };
        delete sanitized['host'];
        delete sanitized['content-length'];
        delete sanitized['connection'];
        delete sanitized['accept-encoding'];
        return sanitized;
    }

    getServiceForRoute(path: string): string | null {
        for (const service of Object.values(SERVICES)) {
            for (const route of service.routes) {
                const matches = this.matchRoute(path, route);
                if (matches) {
                    return service.name;
                }
            }
        }
        this.logger.warn(`No service found for path: ${path}`);
        return null;
    }

    private matchRoute(path: string, pattern: string): boolean {
        const regexPattern = pattern.replace(/\*/g, '.*');
        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(path);
    }
}
