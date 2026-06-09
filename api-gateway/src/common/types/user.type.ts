export interface User {
    id: string;
    email: string;
    name?: string;
    username?: string;
    role?: string;
}

declare global {
    namespace Express {
        interface Request {
            user?: User;
        }
    }
}
