import { ApiProperty } from '@nestjs/swagger'
import { AttendanceStatus, CheckinMethod, StudentStatus } from '../../../generated/prisma/client'

/** Student profile subset shown on /liff/profile (no timestamps/audit noise). */
export class StudentProfileDto {
  @ApiProperty() id!: string
  @ApiProperty({ example: '660112230038' }) studentCode!: string
  @ApiProperty({ example: 'Somchai' }) firstName!: string
  @ApiProperty({ example: 'Jaidee' }) lastName!: string
  @ApiProperty({ example: '2004-01-01', description: 'วันเกิด (ค.ศ.) รูปแบบ YYYY-MM-DD' }) birthDate!: string
  @ApiProperty({ example: 3 }) year!: number
  @ApiProperty({ nullable: true, example: 'student@example.com' }) email!: string | null
  @ApiProperty({ enum: StudentStatus }) status!: StudentStatus
}

/** LINE link info from line_accounts. */
export class LineLinkInfoDto {
  @ApiProperty({ example: 'U91AFXXXXXXXX' }) lineUserId!: string
  @ApiProperty({ nullable: true, example: 'Somchai' }) displayName!: string | null
  @ApiProperty({ nullable: true, example: 'https://profile.line-scdn.net/...' }) pictureUrl!: string | null
  @ApiProperty({ example: '2026-08-22T00:00:00.000Z' }) linkedAt!: string
}

/** GET /me payload: student profile + LINE link status (spec §35). */
export class MeResponseDto {
  @ApiProperty({ description: 'บัญชี LINE นี้เชื่อมกับนักศึกษาแล้วหรือไม่' }) linked!: boolean
  @ApiProperty({ nullable: true, type: StudentProfileDto }) student!: StudentProfileDto | null
  @ApiProperty({ nullable: true, type: LineLinkInfoDto }) line!: LineLinkInfoDto | null
}

/** One attendance record of the signed-in student (GET /me/attendances). */
export class AttendanceItemDto {
  @ApiProperty() id!: string
  @ApiProperty() activityId!: string
  @ApiProperty({ example: 'ปฐมนิเทศน์นักศึกษาใหม่' }) activityName!: string
  @ApiProperty({ example: '2026-08-22T02:00:00.000Z', description: 'เวลาเช็คชื่อ (UTC) แสดงผลเป็น Asia/Bangkok' })
  checkInAt!: string
  @ApiProperty({ enum: AttendanceStatus }) status!: AttendanceStatus
  @ApiProperty({ enum: CheckinMethod }) checkinMethod!: CheckinMethod
}
