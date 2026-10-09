import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { sendProblem, toProblem, tooManyRequests } from './problem';
import { sessionToken } from '../auth/session-cookie';

interface Rule {
    name: string;
    method?: string;
    path?: RegExp;
    limit: number;
    windowMs: number;
    perIp?: boolean;
}

interface Window {
    count: number;
    resetAt: number;
}

const MINUTE = 60_000;

// The first matching specific rule is reported in the RateLimit-* headers; the global rule always applies too.
export const RULES: Rule[] = [
    { name: 'sign-up', method: 'POST', path: /^\/auth\/sign-up$/, limit: 5, windowMs: MINUTE, perIp: true },
    { name: 'sign-in', method: 'POST', path: /^\/auth\/sign-in$/, limit: 10, windowMs: MINUTE, perIp: true },
    { name: 'forgot', method: 'POST', path: /^\/auth\/password\/forgot$/, limit: 3, windowMs: MINUTE, perIp: true },
    { name: 'search', method: 'POST', path: /^\/search$/, limit: 60, windowMs: MINUTE },
    { name: 'message', method: 'POST', path: /^\/conversations\/[^/]+\/messages$/, limit: 20, windowMs: MINUTE },
];
export const GLOBAL_RULE: Rule = { name: 'global', limit: 100, windowMs: MINUTE };

export class RateLimiter {
    private readonly windows = new Map<string, Window>();

    constructor(
        private readonly rules: Rule[] = RULES,
        private readonly globalRule: Rule = GLOBAL_RULE,
        private readonly now: () => number = Date.now,
    ) {}

    middleware = (req: Request, res: Response, next: NextFunction): void => {
        const ip = req.ip ?? 'unknown';
        const token = sessionToken(req.headers.cookie);
        const caller = token ? `s:${createHash('sha256').update(token).digest('hex').slice(0, 32)}` : `ip:${ip}`;
        const specific = this.rules.find((rule) => rule.method === req.method && rule.path?.test(req.path));

        const checks = [this.hit(this.globalRule, caller)];
        if (specific) checks.unshift(this.hit(specific, specific.perIp ? `ip:${ip}` : caller));
        const reported = checks[0];
        const resetSeconds = Math.max(0, Math.ceil((reported.window.resetAt - this.now()) / 1000));
        res.setHeader('RateLimit-Limit', reported.rule.limit);
        res.setHeader('RateLimit-Remaining', Math.max(0, reported.rule.limit - reported.window.count));
        res.setHeader('RateLimit-Reset', resetSeconds);

        const exceeded = checks.find((check) => check.window.count > check.rule.limit);
        if (!exceeded) return next();
        res.setHeader('Retry-After', Math.max(1, Math.ceil((exceeded.window.resetAt - this.now()) / 1000)));
        sendProblem(res, toProblem(tooManyRequests('Too many requests; slow down and retry later')));
    };

    sweep(): void {
        const now = this.now();
        for (const [key, window] of this.windows) {
            if (window.resetAt <= now) this.windows.delete(key);
        }
    }

    private hit(rule: Rule, caller: string): { rule: Rule; window: Window } {
        const key = `${rule.name}:${caller}`;
        const now = this.now();
        let window = this.windows.get(key);
        if (!window || window.resetAt <= now) {
            window = { count: 0, resetAt: now + rule.windowMs };
            this.windows.set(key, window);
        }
        window.count += 1;
        return { rule, window };
    }
}
