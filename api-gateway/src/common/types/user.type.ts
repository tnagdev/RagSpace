import type { AuthUser } from '@ragspace/shared-ts';

// Gateway-local narrowing: extends the shared wire type with an optional role field
// injected by downstream auth validation.
export interface GatewayUser extends AuthUser {
    role?: string;
}

// Keep backward-compat alias so existing code that imports `User` still compiles
export type User = GatewayUser;

declare global {
    namespace Express {
        interface Request {
            user?: GatewayUser;
        }
    }
}
