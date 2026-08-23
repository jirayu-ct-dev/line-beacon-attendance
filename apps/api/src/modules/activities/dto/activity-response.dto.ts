import { ApiProperty } from '@nestjs/swagger'
import { ActivityStatus } from '../../../generated/prisma/client'
import { BeaconResponseDto } from '../../beacons/dto/beacon-response.dto'

/** Computed time state (spec §12) — never persisted. */
export type ActivityTimeState = 'UPCOMING' | 'CHECKIN_OPEN' | 'ONGOING' | 'COMPLETED'

export class ActivityCreatorDto {
  @ApiProperty() id!: string
  @ApiProperty({ example: 'somorganizer' }) username!: string
}

/** Activity payload returned by the list and detail endpoints. */
export class ActivityResponseDto {
  @ApiProperty() id!: string
  @ApiProperty({ example: 'Orientation 2026' }) name!: string
  @ApiProperty({ nullable: true }) description!: string | null
  @ApiProperty({ nullable: true, example: 'ห้องประชุมใหญ่' }) location!: string | null
  @ApiProperty({ example: '2026-09-01T13:00:00.000Z' }) startAt!: string
  @ApiProperty({ example: '2026-09-01T16:00:00.000Z' }) endAt!: string
  @ApiProperty({ example: '2026-09-01T12:30:00.000Z' }) checkinOpenAt!: string
  @ApiProperty({ example: '2026-09-01T14:00:00.000Z' }) lateAt!: string
  @ApiProperty({ example: '2026-09-01T15:00:00.000Z' }) checkinCloseAt!: string
  @ApiProperty({ enum: ActivityStatus }) status!: ActivityStatus
  @ApiProperty({ enum: ['UPCOMING', 'CHECKIN_OPEN', 'ONGOING', 'COMPLETED'] }) timeState!: ActivityTimeState
  @ApiProperty() createdBy!: string
  @ApiProperty({ type: ActivityCreatorDto }) creator!: ActivityCreatorDto
  @ApiProperty({ description: 'จำนวนบีคอนที่ลิงก์อยู่' }) beaconCount!: number
  @ApiProperty({ example: '2026-08-22T00:00:00.000Z' }) createdAt!: string
  @ApiProperty({ example: '2026-08-22T00:00:00.000Z' }) updatedAt!: string
}

export class AttendanceSummaryDto {
  @ApiProperty({ description: 'นักศึกษา ACTIVE ทั้งหมด (spec §24)' }) totalStudents!: number
  @ApiProperty() present!: number
  @ApiProperty() late!: number
  @ApiProperty() excused!: number
  @ApiProperty({ description: 'คำนวณ: Total − Present − Late − Excused (ไม่ persist, spec §44)' }) absent!: number
}

export class ActivityDetailDto extends ActivityResponseDto {
  @ApiProperty({ type: BeaconResponseDto, isArray: true }) beacons!: BeaconResponseDto[]
  @ApiProperty({ type: AttendanceSummaryDto }) attendanceSummary!: AttendanceSummaryDto
}
