/**
 * Activity time-ordering rules (spec §47). All timestamps are compared as UTC
 * Dates — the API receives/stores UTC and only the presentation layer shows
 * Asia/Bangkok (spec §43).
 */
export interface ActivityTimes {
  startAt: Date
  endAt: Date
  checkinOpenAt: Date
  lateAt: Date
  checkinCloseAt: Date
}

/**
 * Returns a Thai error message when the ordering is invalid, null when valid.
 *
 * Design decision (spec §47 grants discretion on the last rule):
 * `checkin_close_at <= end_at` is enforced strictly — check-in never outlives
 * the activity. Applied identically on create and update, covered by tests.
 */
export function validateActivityTimes(times: ActivityTimes): string | null {
  if (times.startAt >= times.endAt) return 'เวลาเริ่มกิจกรรมต้องมาก่อนเวลาสิ้นสุด'
  if (times.checkinOpenAt > times.startAt) return 'เวลาเปิดเช็คชื่อต้องไม่ช้ากว่าเวลาเริ่มกิจกรรม'
  if (times.lateAt < times.checkinOpenAt) return 'เวลาเกณฑ์มาสายต้องไม่เร็วกว่าเวลาเปิดเช็คชื่อ'
  if (times.lateAt > times.checkinCloseAt) return 'เวลาเกณฑ์มาสายต้องไม่ช้ากว่าเวลาปิดเช็คชื่อ'
  if (times.checkinCloseAt > times.endAt) return 'เวลาปิดเช็คชื่อต้องไม่ช้ากว่าเวลาสิ้นสุดกิจกรรม'
  return null
}
