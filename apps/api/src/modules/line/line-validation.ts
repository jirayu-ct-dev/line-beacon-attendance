/**
 * DDMMYYYY (ค.ศ.) birth-date input used by the LIFF account-linking form
 * (spec §7.1: e.g. born 1 Jan 2004 -> "01012004").
 */

export const BIRTH_DATE_DDMMYYYY_RE = /^\d{8}$/

/**
 * Parses a `DDMMYYYY` (ค.ศ.) string into a UTC calendar date. Returns null
 * when the format is wrong or the date does not exist (e.g. 32012004 ->
 * 32 Jan, 30022004 -> 30 Feb) — callers decide how to report it.
 */
export function parseDdMmYyyy(value: string): Date | null {
  if (!BIRTH_DATE_DDMMYYYY_RE.test(value)) return null
  const day = Number(value.slice(0, 2))
  const month = Number(value.slice(2, 4))
  const year = Number(value.slice(4))
  const date = new Date(Date.UTC(year, month - 1, day))
  // Reject rollovers (Date normalizes 30 Feb -> 2 Mar)
  if (date.getUTCDate() !== day || date.getUTCMonth() !== month - 1 || date.getUTCFullYear() !== year) {
    return null
  }
  return date
}

/** Calendar-day key ("YYYY-MM-DD") for comparing @db.Date values. */
export function calendarDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}
