// Jest globalSetup: starts a disposable Postgres 17 container (Testcontainers,
// design doc §10), applies Prisma migrations, and exports the connection URL
// via a temp file that setup-env.ts reads in each test worker.
//
// NOTE: keep this file to erasable TS syntax only — Jest loads globalSetup with
// a native dynamic import (no ts-jest transform).
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const DB_URL_FILE = join(tmpdir(), 'line-beacon-attendance-test-db.url')
export const CONTAINER_ID_FILE = join(tmpdir(), 'line-beacon-attendance-test-db.container')

export default async function (): Promise<void> {
  // Ryuk (testcontainers' reaper) is disabled in this environment because its
  // image cannot be pulled; global-teardown.ts removes the container instead.
  process.env.TESTCONTAINERS_RYUK_DISABLED = 'true'
  const { PostgreSqlContainer } = await import('@testcontainers/postgresql')

  const container = await new PostgreSqlContainer('postgres:17-alpine')
    .withDatabase('line_beacon_test')
    .withUsername('postgres')
    .withPassword('postgres')
    .start()

  const databaseUrl = container.getConnectionUri()
  writeFileSync(DB_URL_FILE, databaseUrl)
  writeFileSync(CONTAINER_ID_FILE, container.getId())

  execFileSync(join(process.cwd(), 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  })

  console.log(`[test db] postgres container ready: ${databaseUrl}`)
}
