interface SignUpPayload {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
}


interface LoginPayload {
    emailOrUsername: string;
    password: string;
}

interface AuthUser {
    id: string;
    email: string;
    name: string;
    image: string | null;
    emailVerified: boolean;
    createdAt: string;
    updatedAt: string;
}

interface AuthResponse {
    redirect: boolean;
    token: string;
    user: AuthUser;
}


interface AuthSession {
    user: AuthUser;
}