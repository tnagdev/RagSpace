import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { GoogleLoginQueryDto } from './google-login-query.dto';

function buildDto(overrides: Partial<GoogleLoginQueryDto> = {}): GoogleLoginQueryDto {
    return plainToInstance(GoogleLoginQueryDto, overrides);
}

describe('GoogleLoginQueryDto', () => {
    it('passes when callbackURL is omitted', async () => {
        const errors = await validate(buildDto());
        expect(errors.length).toBe(0);
    });

    it('passes with a valid callbackURL string', async () => {
        const errors = await validate(buildDto({ callbackURL: 'http://localhost:3000/auth/callback' }));
        expect(errors.length).toBe(0);
    });

    it('rejects a callbackURL longer than 500 characters', async () => {
        const errors = await validate(buildDto({ callbackURL: 'a'.repeat(501) }));
        expect(errors.some(e => e.property === 'callbackURL')).toBe(true);
    });
});
