/**
 * User-facing LINE message texts and notification types (spec §20, §39, §41).
 * All texts are Thai per spec §20 wording. Phase 7 adds the check-in
 * success/late messages (spec §20 examples) once attendance exists.
 *
 * Type strings intentionally match ProcessingStatus names so the cooldown
 * lookups can reuse them directly (spec §42).
 */
export const NOTIFICATION_TYPES = {
  UNKNOWN_USER: 'UNKNOWN_USER',
  NO_ACTIVE_ACTIVITY: 'NO_ACTIVE_ACTIVITY',
} as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES]

export const LINE_MESSAGES = {
  /** Spec §39: LINE user not linked to any student ("อาจส่ง LINE Notification"). */
  UNKNOWN_USER: 'ยังไม่ได้เชื่อมบัญชีนักศึกษา\nกรุณาลงทะเบียนก่อนใช้งานระบบเช็คชื่อ',
  /** Spec §20: beacon detected but no open activity. */
  NO_ACTIVE_ACTIVITY: '📍 ตรวจพบว่าคุณเข้าสู่พื้นที่\n\nขณะนี้ไม่มีกิจกรรมที่เปิดให้เช็คชื่อ',
} as const
