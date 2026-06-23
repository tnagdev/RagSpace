import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SignInDto } from './sign-in.dto';

function buildDto(overrides: Partial<SignInDto> = {}): SignInDto {
    return plainToInstance(SignInDto, {
        email: 'user@example.com',
        password: 'anypassword',
        ...overrides,
    });
}

describe('SignInDto', () => {
    it('passes with a valid email and non-empty password', async () => {
        const errors = await validate(buildDto());
        expect(errors.length).toBe(0);
    });

    it('rejects an empty email', async () => {
        const errors = await validate(buildDto({ email: '' }));
        expect(errors.some(e => e.property === 'email')).toBe(true);
    });

    it('rejects an email with an invalid format', async () => {
        const errors = await validate(buildDto({ email: 'not-an-email' }));
        expect(errors.some(e => e.property === 'email')).toBe(true);
    });

    it('rejects an email with a plus alias', async () => {
        const errors = await validate(buildDto({ email: 'user+tag@example.com' }));
        expect(errors.some(e => e.property === 'email')).toBe(true);
    });

    it('rejects an empty password', async () => {
        const errors = await validate(buildDto({ password: '' }));
        expect(errors.some(e => e.property === 'password')).toBe(true);
    });

    it('does not enforce password complexity on sign-in', async () => {
        // Strength rules apply only at sign-up; existing users must be able to log in
        const errors = await validate(buildDto({ password: 'simple' }));
        expect(errors.length).toBe(0);
    });
});
