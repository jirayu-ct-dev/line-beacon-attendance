/**
 * User-facing LINE message texts and notification types (spec §20, §39, §41,
 * §42). All texts are Thai per spec §20 wording.
 *
 * Type strings intentionally match ProcessingStatus names so the cooldown
 * lookups can reuse them directly (spec §42). PRESENT/LATE are the §20
 * success/late outcomes recorded on the notifications row.
 */
export const NOTIFICATION_TYPES = {
  UNKNOWN_USER: 'UNKNOWN_USER',
  NO_ACTIVE_ACTIVITY: 'NO_ACTIVE_ACTIVITY',
  OUTSIDE_CHECKIN_WINDOW: 'OUTSIDE_CHECKIN_WINDOW',
  PRESENT: 'PRESENT',
  LATE: 'LATE',
} as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES]

export const LINE_MESSAGES = {
  /** Spec §39: LINE user not linked to any student ("อาจส่ง LINE Notification"). */
  UNKNOWN_USER: 'ยังไม่ได้เชื่อมบัญชีนักศึกษา\nกรุณาลงทะเบียนก่อนใช้งานระบบเช็คชื่อ',
  /** Spec §20: beacon detected but no open activity. */
  NO_ACTIVE_ACTIVITY: '📍 ตรวจพบว่าคุณเข้าสู่พื้นที่\n\nขณะนี้ไม่มีกิจกรรมที่เปิดให้เช็คชื่อ',
  /** Spec §42: same cooldown treatment as NO_ACTIVE_ACTIVITY (early/too late). */
  OUTSIDE_CHECKIN_WINDOW: '📍 ตรวจพบว่าคุณเข้าสู่พื้นที่\n\nขณะนี้อยู่นอกช่วงเวลาเช็คชื่อของกิจกรรม',
} as const

const BANGKOK_TIME = new Intl.DateTimeFormat('th-TH', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Asia/Bangkok',
})

/**
 * Spec §20 success/late template. The time shown is the official check-in
 * time — the LINE event timestamp — formatted in Asia/Bangkok (spec §16, §43).
 */
export const checkinSuccessMessage = (
  activityName: string,
  checkInAt: Date,
  status: 'PRESENT' | 'LATE',
): string => {
  const lines = [
    status === 'PRESENT' ? '✅ เช็คชื่อสำเร็จ' : '⚠️ เช็คชื่อสำเร็จ',
    '',
    'กิจกรรม:',
    activityName,
    '',
    'เวลา:',
    `${BANGKOK_TIME.format(checkInAt)} น.`,
    '',
    'สถานะ:',
    status === 'PRESENT' ? 'เข้าร่วม' : 'มาสาย',
  ]
  return lines.join('\n')
}
