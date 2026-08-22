// Jest globalTeardown: removes the test postgres container started by
// global-setup.ts. Ryuk is disabled in this environment, so without this the
// container would leak. Keep to erasable TS syntax (see global-setup.ts note).
import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DB_URL_FILE = join(tmpdir(), 'line-beacon-attendance-test-db.url')
const CONTAINER_ID_FILE = join(tmpdir(), 'line-beacon-attendance-test-db.container')

export default async function (): Promise<void> {
  try {
    const containerId = readFileSync(CONTAINER_ID_FILE, 'utf8').trim()
    if (containerId) {
      execFileSync('docker', ['rm', '-f', containerId], { stdio: 'inherit' })
      console.log(`[test db] removed container ${containerId.slice(0, 12)}`)
    }
  } finally {
    rmSync(DB_URL_FILE, { force: true })
    rmSync(CONTAINER_ID_FILE, { force: true })
  }
}
