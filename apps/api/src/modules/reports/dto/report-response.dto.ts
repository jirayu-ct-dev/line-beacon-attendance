import { ApiProperty } from '@nestjs/swagger'
import { ActivityStatus, StudentStatus } from '../../../generated/prisma/client'
import { ActivityCreatorDto, AttendanceSummaryDto } from '../../activities/dto/activity-response.dto'
import { AttendanceRowDto, StudentAttendanceRowDto } from '../../attendance/dto/attendance-response.dto'

/** Header block of the activity report (spec §44: name, date, organizer). */
export class ActivityReportActivityDto {
  @ApiProperty() id!: string
  @ApiProperty({ example: 'Orientation 2026' }) name!: string
  @ApiProperty({ example: '2026-09-01T13:00:00.000Z' }) startAt!: string
  @ApiProperty({ example: '2026-09-01T16:00:00.000Z' }) endAt!: string
  @ApiProperty({ example: '2026-09-01T12:30:00.000Z' }) checkinOpenAt!: string
  @ApiProperty({ example: '2026-09-01T15:00:00.000Z' }) checkinCloseAt!: string
  @ApiProperty({ enum: ActivityStatus }) status!: ActivityStatus
  @ApiProperty({ type: ActivityCreatorDto }) organizer!: ActivityCreatorDto
}

/** GET /reports/activities/:id — header + §44 counts + the full attendance list. */
export class ActivityReportDto {
  @ApiProperty({ type: ActivityReportActivityDto }) activity!: ActivityReportActivityDto
  @ApiProperty({ type: AttendanceSummaryDto }) summary!: AttendanceSummaryDto
  @ApiProperty({ type: AttendanceRowDto, isArray: true }) attendances!: AttendanceRowDto[]
}

/** Student header on GET /reports/students/:id. */
export class StudentReportStudentDto {
  @ApiProperty() id!: string
  @ApiProperty({ example: '660112230038' }) studentCode!: string
  @ApiProperty({ example: 'Somchai Jaidee' }) name!: string
  @ApiProperty({ enum: StudentStatus }) status!: StudentStatus
}

/** Counts across the student's attendance rows (no absent — that needs an activity scope). */
export class StudentReportSummaryDto {
  @ApiProperty({ description: 'จำนวนรายการเช็คชื่อทั้งหมด' }) total!: number
  @ApiProperty() present!: number
  @ApiProperty() late!: number
  @ApiProperty() excused!: number
}

/** GET /reports/students/:id — student header + counts + full history. */
export class StudentReportDto {
  @ApiProperty({ type: StudentReportStudentDto }) student!: StudentReportStudentDto
  @ApiProperty({ type: StudentReportSummaryDto }) summary!: StudentReportSummaryDto
  @ApiProperty({ type: StudentAttendanceRowDto, isArray: true }) attendances!: StudentAttendanceRowDto[]
}
