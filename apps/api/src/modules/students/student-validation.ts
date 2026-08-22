/**
 * Shared student-field validation (spec §47) used by both the DTO-validated
 * create/update path (service-level birth-date sanity) and the file import
 * (row-level checks with Thai messages).
 */

export const STUDENT_CODE_RE = /^\d{12}$/
export const BIRTH_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export const MIN_BIRTH_YEAR = 1900

/**
 * Parses a `YYYY-MM-DD` birth date (ค.ศ., spec §8) with sanity checks:
 * real calendar date, year between 1900 and today. Returns null when invalid —
 * callers decide how to report (HTTP 400 vs per-row import error).
 */
export function parseBirthDate(value: string): Date | null {
  if (!BIRTH_DATE_RE.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return null
  // Reject e.g. 2024-02-30 (Date rolls it over to March)
  if (date.toISOString().slice(0, 10) !== value) return null
  if (date.getUTCFullYear() < MIN_BIRTH_YEAR) return null
  if (date.getTime() > Date.now()) return null
  return date
}
