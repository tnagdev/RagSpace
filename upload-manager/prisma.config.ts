import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
    schema: './src/modules/prisma/schema.prisma',
    migrations: {
        path: './src/modules/prisma/migrations'
    },
    datasource: {
        url: env('DATABASE_URL')
    }
});
