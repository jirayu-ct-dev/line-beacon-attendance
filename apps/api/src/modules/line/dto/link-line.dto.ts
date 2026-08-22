import { ApiProperty } from '@nestjs/swagger'
import { IsString, Matches } from 'class-validator'
import { BIRTH_DATE_DDMMYYYY_RE } from '../line-validation'

/**
 * LIFF account-linking payload (spec §7.1): student code + birth date form the
 * two-factor proof (a sequential code alone is guessable). The birth date is
 * `DDMMYYYY` ค.ศ. (e.g. 01012004).
 */
export class LinkLineDto {
  @ApiProperty({ example: '660112230038', description: 'รหัสนักศึกษา ตัวเลข 12 หลัก' })
  @IsString()
  @Matches(/^\d{12}$/, { message: 'รหัสนักศึกษาต้องเป็นตัวเลข 12 หลัก' })
  studentCode!: string

  @ApiProperty({ example: '01012004', description: 'วันเดือนปีเกิด ตัวเลข 8 หลัก DDMMYYYY ปี ค.ศ.' })
  @IsString()
  @Matches(BIRTH_DATE_DDMMYYYY_RE, { message: 'วันเดือนปีเกิดต้องเป็นตัวเลข 8 หลักในรูปแบบ DDMMYYYY เช่น 01012004' })
  birthDate!: string
}
