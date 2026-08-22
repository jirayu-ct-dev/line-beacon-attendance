// Jest setupFiles: runs in every test worker BEFORE any module is imported.
// Points DATABASE_URL at the Testcontainers postgres started in global-setup.
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DB_URL_FILE = join(tmpdir(), 'line-beacon-attendance-test-db.url')

process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = readFileSync(DB_URL_FILE, 'utf8').trim()
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-only-jwt-secret-16chars'
}
