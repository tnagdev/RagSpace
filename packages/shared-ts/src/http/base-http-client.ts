// No @nestjs/* or rxjs imports — avoids duplicate type instances when services
// install those packages independently. Subclasses add @Injectable() themselves.
import type { AuthUser } from '../generated/AuthUser';

const DEFAULT_TIMEOUT_MS = 5_000;

export class BaseHttpClient {
  // Minimal logger compatible with NestJS Logger's API surface.
  // Subclasses that need NestJS Logger formatting can override this field.
  protected readonly logger = {
    log:   (msg: string) => console.log(`[${this.serviceName}] ${msg}`),
    error: (msg: string, ctx?: unknown) => console.error(`[${this.serviceName}] ${msg}`, ctx ?? ''),
    warn:  (msg: string) => console.warn(`[${this.serviceName}] ${msg}`),
  };

  // http is typed as `any` to avoid importing @nestjs/axios, which would create
  // a duplicate class identity when the consuming service also installs it.
  // Callers always pass NestJS's HttpService, which satisfies this contract at runtime.
  constructor(
    protected readonly http: any,
    protected readonly serviceName: string,
  ) {}

  protected get<T>(user: AuthUser, url: string, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(user, 'GET', url, undefined, headers);
  }

  protected post<T>(user: AuthUser, url: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(user, 'POST', url, body, headers);
  }

  protected put<T>(user: AuthUser, url: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(user, 'PUT', url, body, headers);
  }

  protected delete<T>(user: AuthUser, url: string, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(user, 'DELETE', url, undefined, headers);
  }

  protected request<T>(
    user: AuthUser,
    method: string,
    url: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const start = Date.now();
    const headers: Record<string, string> = {
      ...extraHeaders,
      'x-user': JSON.stringify(user),
      'x-service': this.serviceName,
    };

    // Use Observable.subscribe() directly — no rxjs import required.
    return new Promise<T>((resolve, reject) => {
      this.http
        .request({ method, url, data: body, headers, timeout: DEFAULT_TIMEOUT_MS })
        .subscribe({
          next: (response: any) => {
            this.logger.log(`${method} ${url} → ${response.status} (${Date.now() - start}ms)`);
            resolve(response.data);
          },
          error: (error: any) => {
            this.logger.error(`${method} ${url} failed (${Date.now() - start}ms)`, error?.stack);
            reject(error);
          },
        });
    });
  }
}
