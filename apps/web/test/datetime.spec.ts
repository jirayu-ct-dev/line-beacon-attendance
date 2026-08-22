import { describe, expect, it } from 'vitest'
import { bangkokInputToUtc, utcToBangkokInput } from '~/utils/datetime'

// The conversion is pure UTC math with the fixed +07:00 offset (no DST in
// Thailand), so expected values are exact regardless of the runner's timezone.
describe('datetime helpers (Bangkok wall time ↔ ISO UTC)', () => {
  it('bangkokInputToUtc converts Bangkok wall time to UTC', () => {
    expect(bangkokInputToUtc('2026-09-01T20:00')).toBe('2026-09-01T13:00:00.000Z')
    expect(bangkokInputToUtc('2026-01-01T00:30')).toBe('2025-12-31T17:30:00.000Z') // crosses midnight UTC
  })

  it('bangkokInputToUtc rejects malformed values with null', () => {
    expect(bangkokInputToUtc('')).toBeNull()
    expect(bangkokInputToUtc('2026-09-01')).toBeNull()
    expect(bangkokInputToUtc('2026-09-01T20:00:00')).toBeNull() // datetime-local sends minutes only
    expect(bangkokInputToUtc('2026-13-01T20:00')).toBeNull()
  })

  it('utcToBangkokInput converts UTC to Bangkok datetime-local value', () => {
    expect(utcToBangkokInput('2026-09-01T13:00:00.000Z')).toBe('2026-09-01T20:00')
    expect(utcToBangkokInput('2025-12-31T17:30:00.000Z')).toBe('2026-01-01T00:30') // crosses midnight Bangkok
    expect(utcToBangkokInput('not-a-date')).toBe('')
  })

  it('round-trips through both helpers', () => {
    const utc = '2027-03-10T02:00:00.000Z'
    expect(bangkokInputToUtc(utcToBangkokInput(utc))).toBe(utc)
  })
})
