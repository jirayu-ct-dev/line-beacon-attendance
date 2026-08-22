/**
 * Fail-fast env validation for ConfigModule. Runs once at boot so a missing
 * secret crashes immediately with a clear message instead of at first request.
 */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const jwtSecret = config.JWT_SECRET
  if (typeof jwtSecret !== 'string' || jwtSecret.trim().length < 16) {
    throw new Error(
      'JWT_SECRET is missing or too short: set it to a random string of at least 16 characters (see .env.example). Refusing to start.',
    )
  }
  return config
}
