import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

// Optional: only needed by `prisma migrate dev` / `migrate diff` (replays
// migrations into a throwaway database). Not required for migrate deploy.
const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
    ...(shadowDatabaseUrl ? { shadowDatabaseUrl } : {}),
  },
})
