export const RATE_LIMIT_CONFIG = {
    ttl: parseInt(process.env.RATE_LIMIT_TTL || '60'),
    limit: parseInt(process.env.RATE_LIMIT_MAX || '100'),
};

export const STRICT_RATE_LIMIT_CONFIG = {
    ttl: 60,
    limit: 10,
};
