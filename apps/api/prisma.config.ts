import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx --env-file=.env prisma/seed.ts',
  },
  datasource: {
    // Migrations use the direct connection; the app uses DATABASE_URL at runtime.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
  },
});
