// Activity datetime inputs (design doc §6.3): the form works in Asia/Bangkok
// and the API exchanges ISO UTC. datetime-local values are therefore treated
// as Bangkok wall time explicitly — never the browser's local timezone — so
// the stored UTC instant is identical no matter where the user's OS is set.
// Thailand has no DST, so the fixed +07:00 offset is exact year-round.

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000

/**
 * `YYYY-MM-DDTHH:mm` (Bangkok wall time, e.g. from a datetime-local input) →
 * ISO UTC string. Invalid input returns null.
 */
export const bangkokInputToUtc = (value: string): string | null => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const date = new Date(`${value}:00.000+07:00`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** ISO UTC string → `YYYY-MM-DDTHH:mm` in Bangkok wall time (for datetime-local inputs). */
export const utcToBangkokInput = (iso: string): string => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const shifted = new Date(date.getTime() + BANGKOK_OFFSET_MS)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${shifted.getUTCFullYear()}-${p(shifted.getUTCMonth() + 1)}-${p(shifted.getUTCDate())}T${p(shifted.getUTCHours())}:${p(shifted.getUTCMinutes())}`
}
