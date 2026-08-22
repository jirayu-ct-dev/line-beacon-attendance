import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator'

/** Full ISO-8601 UTC datetime — the format Date.prototype.toISOString() sends (spec §43: store UTC). */
export const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/
export const ISO_DATETIME_MESSAGE = 'ต้องเป็นวันที่เวลา ISO 8601 แบบ UTC เช่น 2026-09-01T13:00:00.000Z'

export class CreateActivityDto {
  @ApiProperty({ example: 'Orientation 2026' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string

  @ApiProperty({ required: false, nullable: true, example: 'กิจกรรมต้อนรับนักศึกษาใหม่' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string

  @ApiProperty({ required: false, nullable: true, example: 'ห้องประชุมใหญ่' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string

  @ApiProperty({ example: '2026-09-01T13:00:00.000Z', description: 'เวลาเริ่มกิจกรรม (UTC)' })
  @Matches(ISO_DATETIME_RE, { message: ISO_DATETIME_MESSAGE })
  startAt!: string

  @ApiProperty({ example: '2026-09-01T16:00:00.000Z', description: 'เวลาสิ้นสุดกิจกรรม (UTC)' })
  @Matches(ISO_DATETIME_RE, { message: ISO_DATETIME_MESSAGE })
  endAt!: string

  @ApiProperty({ example: '2026-09-01T12:30:00.000Z', description: 'เวลาเปิดเช็คชื่อ (UTC)' })
  @Matches(ISO_DATETIME_RE, { message: ISO_DATETIME_MESSAGE })
  checkinOpenAt!: string

  @ApiProperty({ example: '2026-09-01T14:00:00.000Z', description: 'เกณฑ์มาสาย — เช็คหลังเวลานี้ถือว่า LATE (UTC)' })
  @Matches(ISO_DATETIME_RE, { message: ISO_DATETIME_MESSAGE })
  lateAt!: string

  @ApiProperty({ example: '2026-09-01T15:00:00.000Z', description: 'เวลาปิดเช็คชื่อ (UTC)' })
  @Matches(ISO_DATETIME_RE, { message: ISO_DATETIME_MESSAGE })
  checkinCloseAt!: string
}
