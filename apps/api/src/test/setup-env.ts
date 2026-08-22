// Jest setupFiles: runs in every test worker BEFORE any module is imported.
// Points DATABASE_URL at the Testcontainers postgres started in global-setup.
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DB_URL_FILE = join(tmpdir(), 'line-beacon-attendance-test-db.url')

/**
 * The LINE webhook verifies x-line-signature with LINE_CHANNEL_SECRET
 * (line-webhook.spec.ts signs with the same value). Must be set here: apps/
 * api/.env (loaded by ConfigModule at AppModule import time) contains an
 * EMPTY LINE_CHANNEL_SECRET which would otherwise make the webhook 503.
 */
export const TEST_LINE_CHANNEL_SECRET = 'test-line-channel-secret'

process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = readFileSync(DB_URL_FILE, 'utf8').trim()
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-only-jwt-secret-16chars'
}
if (!process.env.LINE_CHANNEL_SECRET) {
  process.env.LINE_CHANNEL_SECRET = TEST_LINE_CHANNEL_SECRET
}
