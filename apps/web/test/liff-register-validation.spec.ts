import { describe, expect, it } from 'vitest'
import { liffRegisterSchema, isValidBirthDateDdMmYyyy } from '~/utils/liff-register'

/** Full calendar-invalidity message (schema messages are exact strings). */
const CALENDAR_MSG = 'วันเดือนปีเกิดไม่ใช่วันที่ที่มีอยู่จริง กรุณาตรวจสอบวัน เดือน ปี (ค.ศ.) อีกครั้ง'

/** Form validation of /liff/register (spec §7.1): DDMMYYYY ค.ศ., real calendar date. */
const validate = (studentCode: string, birthDate: string): string[] => {
  const result = liffRegisterSchema.safeParse({ studentCode, birthDate })
  return result.success ? [] : result.error.issues.map((issue) => issue.message)
}

describe('liff register schema', () => {
  it('accepts a valid code + real birth date (incl. leap day)', () => {
    expect(validate('660112230038', '01012004')).toEqual([])
    expect(validate('660112230038', '29022004')).toEqual([])
  })

  it('requires the student code to be exactly 12 digits (Thai message)', () => {
    expect(validate('123', '01012004')).toContain('รหัสนักศึกษาต้องเป็นตัวเลข 12 หลัก')
    expect(validate('66011223003', '01012004')).toContain('รหัสนักศึกษาต้องเป็นตัวเลข 12 หลัก')
    expect(validate('66011223003a', '01012004')).toContain('รหัสนักศึกษาต้องเป็นตัวเลข 12 หลัก')
    expect(validate('', '01012004')).toContain('กรุณากรอกรหัสนักศึกษา')
  })

  it('requires the birth date to be 8 digits (Thai message)', () => {
    expect(validate('660112230038', '0101200')).toContain(
      'วันเดือนปีเกิดต้องเป็นตัวเลข 8 หลักในรูปแบบ DDMMYYYY เช่น 01012004',
    )
    expect(validate('660112230038', '')).toContain('กรุณากรอกวันเดือนปีเกิด')
  })

  it('rejects calendar dates that do not exist (Thai message)', () => {
    expect(validate('660112230038', '32012004')).toContain(CALENDAR_MSG)
    expect(validate('660112230038', '30022004')).toContain(CALENDAR_MSG) // 30 Feb
    expect(validate('660112230038', '010113')).toEqual(
      expect.arrayContaining([expect.stringContaining('DDMMYYYY')]),
    )
  })

  it('rejects implausible years (before 1900 or in the future)', () => {
    expect(isValidBirthDateDdMmYyyy('01011890')).toBe(false)
    expect(isValidBirthDateDdMmYyyy(`0101${new Date().getFullYear() + 1}`)).toBe(false)
    expect(validate('660112230038', '01011890')).toContain(CALENDAR_MSG)
  })
})
