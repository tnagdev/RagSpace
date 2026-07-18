import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SignUpDto } from './sign-up.dto';

function buildDto(overrides: Partial<SignUpDto> = {}): SignUpDto {
    return plainToInstance(SignUpDto, {
        email: 'user@example.com',
        password: 'Password1!',
        firstName: 'John',
        lastName: 'Doe',
        ...overrides,
    });
}

describe('SignUpDto', () => {
    it('passes with valid data', async () => {
        const errors = await validate(buildDto());
        expect(errors.length).toBe(0);
    });

    it('rejects an invalid email format', async () => {
        const errors = await validate(buildDto({ email: 'not-an-email' }));
        expect(errors.some(e => e.property === 'email')).toBe(true);
    });

    it('rejects an email with a plus alias', async () => {
        const errors = await validate(buildDto({ email: 'user+tag@example.com' }));
        expect(errors.some(e => e.property === 'email')).toBe(true);
    });

    it('rejects an empty email', async () => {
        const errors = await validate(buildDto({ email: '' }));
        expect(errors.some(e => e.property === 'email')).toBe(true);
    });

    it('rejects a password shorter than 8 characters', async () => {
        const errors = await validate(buildDto({ password: 'Ps1!' }));
        expect(errors.some(e => e.property === 'password')).toBe(true);
    });

    it('rejects a password missing an uppercase letter', async () => {
        const errors = await validate(buildDto({ password: 'password1!' }));
        expect(errors.some(e => e.property === 'password')).toBe(true);
    });

    it('rejects a password missing a special character', async () => {
        const errors = await validate(buildDto({ password: 'Password12' }));
        expect(errors.some(e => e.property === 'password')).toBe(true);
    });

    it('rejects a firstName that is too short (< 2 chars)', async () => {
        const errors = await validate(buildDto({ firstName: 'J' }));
        expect(errors.some(e => e.property === 'firstName')).toBe(true);
    });

    it('rejects a firstName containing digits', async () => {
        const errors = await validate(buildDto({ firstName: 'John123' }));
        expect(errors.some(e => e.property === 'firstName')).toBe(true);
    });

    it('trims leading/trailing whitespace from firstName via the Transform decorator', async () => {
        const dto = buildDto({ firstName: '  Jane  ' });
        await validate(dto);
        expect(dto.firstName).toBe('Jane');
    });
});
