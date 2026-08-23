import { ApiProperty } from '@nestjs/swagger'
import { AttendanceStatus, CheckinMethod } from '../../../generated/prisma/client'

/** Nested student shown on attendance rows (spec §25 columns). */
export class AttendanceStudentDto {
  @ApiProperty() id!: string
  @ApiProperty({ example: '660112230038' }) studentCode!: string
  @ApiProperty({ example: 'Somchai Jaidee' }) name!: string
}

/** Nested beacon that produced a BEACON check-in (null for MANUAL). */
export class AttendanceBeaconDto {
  @ApiProperty() id!: string
  @ApiProperty({ example: 'CS Room 101' }) name!: string
  @ApiProperty({ example: '32af519e88' }) hwid!: string
}

/** Who performed a MANUAL check-in (null for BEACON rows — spec §19). */
export class AttendanceActorDto {
  @ApiProperty() id!: string
  @ApiProperty({ example: 'somchai' }) username!: string
}

/** Attendance row on GET /activities/:id/attendances (spec §25 columns). */
export class AttendanceRowDto {
  @ApiProperty() id!: string
  @ApiProperty({ type: AttendanceStudentDto }) student!: AttendanceStudentDto
  @ApiProperty({ example: '2026-09-01T01:00:00.000Z' }) checkInAt!: string
  @ApiProperty({ enum: AttendanceStatus }) status!: AttendanceStatus
  @ApiProperty({ enum: CheckinMethod }) checkinMethod!: CheckinMethod
  @ApiProperty({ type: AttendanceBeaconDto, nullable: true }) beacon!: AttendanceBeaconDto | null
  @ApiProperty({ type: AttendanceActorDto, nullable: true }) checkedInBy!: AttendanceActorDto | null
  @ApiProperty({ nullable: true, example: 'นักศึกษาปิด Bluetooth' }) manualReason!: string | null
  @ApiProperty({ example: '2026-09-01T00:00:00.000Z' }) createdAt!: string
  @ApiProperty({ example: '2026-09-01T00:00:00.000Z' }) updatedAt!: string
}

/** Row on GET /students/:id/attendances — same data, nested activity instead of student. */
export class StudentAttendanceRowDto {
  @ApiProperty() id!: string
  @ApiProperty() activityId!: string
  @ApiProperty({ example: 'Git & GitHub Workshop' }) activityName!: string
  @ApiProperty({ example: '2026-09-01T01:00:00.000Z' }) checkInAt!: string
  @ApiProperty({ enum: AttendanceStatus }) status!: AttendanceStatus
  @ApiProperty({ enum: CheckinMethod }) checkinMethod!: CheckinMethod
  @ApiProperty({ type: AttendanceBeaconDto, nullable: true }) beacon!: AttendanceBeaconDto | null
  @ApiProperty({ type: AttendanceActorDto, nullable: true }) checkedInBy!: AttendanceActorDto | null
  @ApiProperty({ nullable: true }) manualReason!: string | null
}
