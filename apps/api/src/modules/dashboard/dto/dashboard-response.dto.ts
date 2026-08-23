import { ApiProperty } from '@nestjs/swagger'
import { ActivityStatus } from '../../../generated/prisma/client'

export class TodayStatsDto {
  @ApiProperty({ description: 'กิจกรรมที่เริ่มวันนี้ (ตามวันประเทศไทย)' }) activities!: number
  @ApiProperty({ description: 'การเช็คชื่อที่เกิดวันนี้' }) checkins!: number
  @ApiProperty() present!: number
  @ApiProperty() late!: number
}

export class RecentActivityDto {
  @ApiProperty() id!: string
  @ApiProperty({ example: 'Orientation 2026' }) name!: string
  @ApiProperty({ example: '2026-09-01T13:00:00.000Z' }) startAt!: string
  @ApiProperty({ enum: ActivityStatus }) status!: ActivityStatus
  @ApiProperty({ enum: ['UPCOMING', 'CHECKIN_OPEN', 'ONGOING', 'COMPLETED'] }) timeState!: string
}

export class OpenCheckinActivityDto {
  @ApiProperty() id!: string
  @ApiProperty({ example: 'Git & GitHub Workshop' }) name!: string
  @ApiProperty({ example: '2026-09-01T12:30:00.000Z' }) checkinOpenAt!: string
  @ApiProperty({ example: '2026-09-01T14:00:00.000Z' }) lateAt!: string
  @ApiProperty({ example: '2026-09-01T15:00:00.000Z' }) checkinCloseAt!: string
  @ApiProperty({ description: 'จำนวน PRESENT สะสมของกิจกรรมนี้' }) present!: number
  @ApiProperty({ description: 'จำนวน LATE สะสมของกิจกรรมนี้' }) late!: number
}

/** GET /dashboard payload (spec §23, §45) — scoped by ownership for organizers. */
export class DashboardResponseDto {
  @ApiProperty({ type: TodayStatsDto }) today!: TodayStatsDto
  @ApiProperty() totalActivities!: number
  @ApiProperty({ type: RecentActivityDto, isArray: true, description: 'กิจกรรมล่าสุด 5 รายการ' }) recentActivities!: RecentActivityDto[]
  @ApiProperty({
    type: OpenCheckinActivityDto,
    isArray: true,
    description: 'กิจกรรมที่กำลังเปิดเช็คชื่อ (เผยแพร่ + อยู่ในหน้าต่างเช็คชื่อตอนนี้)',
  }) openCheckinActivities!: OpenCheckinActivityDto[]
}
