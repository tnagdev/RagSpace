import type { Request } from 'express';

// better-auth builds its request URL from X-Forwarded-Proto verbatim, so it must be one value; http-proxy's
// xfwd appends each hop ("https,http" behind a TLS proxy), which makes the OAuth callback URL unparseable.
export function forwardedHeaders(req: Request): Record<string, string> {
    return {
        'x-forwarded-for': [req.get('x-forwarded-for'), req.socket.remoteAddress].filter(Boolean).join(', '),
        'x-forwarded-proto': req.protocol,
        'x-forwarded-host': (req.get('x-forwarded-host') ?? req.get('host') ?? '').split(',')[0].trim(),
    };
}
