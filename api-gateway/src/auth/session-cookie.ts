// better-auth prefixes the cookie with __Secure- when served over HTTPS.
const COOKIE_NAMES = ['__Secure-better-auth.session_token', 'better-auth.session_token'];

export function sessionToken(cookieHeader: string | undefined): string | undefined {
    if (!cookieHeader) return undefined;
    const cookies = new Map<string, string>();
    for (const part of cookieHeader.split(';')) {
        const index = part.indexOf('=');
        if (index > 0) cookies.set(part.slice(0, index).trim(), part.slice(index + 1).trim());
    }
    for (const name of COOKIE_NAMES) {
        const value = cookies.get(name);
        if (value) return value;
    }
    return undefined;
}

export function clearSessionCookies(secure: boolean): string[] {
    const attributes = `Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
    return COOKIE_NAMES.filter((name) => secure || !name.startsWith('__Secure-')).map((name) => `${name}=; ${attributes}`);
}
