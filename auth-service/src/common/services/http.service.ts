import {
    Injectable,
    Logger,
    HttpException,
    ServiceUnavailableException,
} from '@nestjs/common';

import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AuthUser } from 'src/authentication/types/user.type';


const DEFAULT_TIMEOUT = 5000;

@Injectable()
export class BaseHttpClient {
    protected readonly logger = new Logger(BaseHttpClient.name);

    constructor(
        protected readonly http: HttpService,
    ) { }

    protected async get<T>(
        user: AuthUser,
        url: string,
        headers?: Record<string, string>,
    ): Promise<T> {
        return this.request<T>(user, 'GET', url, undefined, headers);
    }

    protected async post<T>(
        user: AuthUser,
        url: string,
        body?: unknown,
        headers?: Record<string, string>,
    ): Promise<T> {
        return this.request<T>(user, 'POST', url, body, headers);
    }

    protected async put<T>(
        user: AuthUser,
        url: string,
        body?: unknown,
        headers?: Record<string, string>,
    ): Promise<T> {
        return this.request<T>(user, 'PUT', url, body, headers);
    }

    protected async request<T>(
        user: AuthUser,
        method: string,
        url: string,
        body?: unknown,
        headers?: Record<string, string>,
    ): Promise<T> {
        const start = Date.now();
        const requestHeaders = {
            ...headers,
            'x-user': JSON.stringify(user),
            'x-service': 'auth-service',
        }

        try {
            this.logger.log(`${method} ${url}`);

            const response = await firstValueFrom(
                this.http.request<T>({
                    method,
                    url,
                    data: body,
                    headers: requestHeaders,
                    timeout: DEFAULT_TIMEOUT,
                }),
            );

            this.logger.log(`${method} ${url} -> ${response.status} (${Date.now() - start}ms)`);
            return response.data;
        } catch (error: any) {
            this.logger.error(`${method} ${url} failed`, error?.stack);

            if (error.response) {
                throw new HttpException(
                    error.response.data,
                    error.response.status,
                );
            }

            throw new ServiceUnavailableException('Downstream service unavailable');
        }
    }
}