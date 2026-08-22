/**
 * Parses simple duration strings like "30s", "15m", "12h", "7d" into milliseconds.
 * Used to align cookie maxAge / DB expiry with JWT_EXPIRES_IN and REFRESH_EXPIRES_IN.
 */
const UNITS_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
}

export function parseDurationMs(value: string, fallbackMs: number): number {
  const match = /^(\d+)\s*([smhd])$/.exec(value.trim())
  return match ? Number(match[1]) * UNITS_MS[match[2]] : fallbackMs
}
