import { z } from 'zod'

/**
 * Account-linking form validation for /liff/register (spec §7.1). Kept in
 * utils so the Thai messages can be unit-tested directly.
 */

/** DDMMYYYY ค.ศ. — must be a real calendar date in a plausible range (spec §7.1/§47). */
export const isValidBirthDateDdMmYyyy = (value: string): boolean => {
  if (!/^\d{8}$/.test(value)) return false
  const day = Number(value.slice(0, 2))
  const month = Number(value.slice(2, 4))
  const year = Number(value.slice(4))
  if (year < 1900 || year > new Date().getFullYear()) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  // Reject rollovers (e.g. 30022004 -> 1 Mar)
  return date.getUTCDate() === day && date.getUTCMonth() === month - 1 && date.getUTCFullYear() === year
}

export const liffRegisterSchema = z.object({
  studentCode: z
    .string({ error: 'กรุณากรอกรหัสนักศึกษา' })
    .trim()
    .min(1, 'กรุณากรอกรหัสนักศึกษา')
    .regex(/^\d{12}$/, 'รหัสนักศึกษาต้องเป็นตัวเลข 12 หลัก'),
  birthDate: z
    .string({ error: 'กรุณากรอกวันเดือนปีเกิด' })
    .trim()
    .min(1, 'กรุณากรอกวันเดือนปีเกิด')
    .regex(/^\d{8}$/, 'วันเดือนปีเกิดต้องเป็นตัวเลข 8 หลักในรูปแบบ DDMMYYYY เช่น 01012004')
    .refine(isValidBirthDateDdMmYyyy, 'วันเดือนปีเกิดไม่ใช่วันที่ที่มีอยู่จริง กรุณาตรวจสอบวัน เดือน ปี (ค.ศ.) อีกครั้ง'),
})

export type LiffRegisterForm = z.infer<typeof liffRegisterSchema>
