/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Disposable Postgres (Testcontainers) shared by all spec files — see src/test/
  globalSetup: '<rootDir>/src/test/global-setup.ts',
  globalTeardown: '<rootDir>/src/test/global-teardown.ts',
  setupFiles: ['<rootDir>/src/test/setup-env.ts'],
  // All specs share ONE Testcontainers database and some assert exact table
  // counts (e.g. GET /students totals) — serialize spec files so concurrent
  // workers cannot see each other's seed data.
  maxWorkers: 1,
}
