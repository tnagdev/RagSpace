import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';
import { describe, expect, it } from 'vitest';

// The Docker build only sees frontend/, so the generated types are committed; this keeps them honest.
describe('generated API types', () => {
    it('match contracts/openapi/public.v1.yaml (run npm run generate:api)', async () => {
        const spec = pathToFileURL(resolve(__dirname, '../../../contracts/openapi/public.v1.yaml'));
        const expected = astToString(await openapiTS(spec));
        const committed = readFileSync(resolve(__dirname, 'schema.d.ts'), 'utf8').replace(/^\/\*\*[\s\S]*?\*\/\s*/, '');
        expect(committed.trim()).toBe(expected.trim());
    });
});
