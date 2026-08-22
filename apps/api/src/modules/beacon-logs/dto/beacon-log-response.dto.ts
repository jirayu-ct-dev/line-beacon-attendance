import { ApiProperty } from '@nestjs/swagger'
import { ProcessingStatus } from '../../../generated/prisma/client'

/** Nested student shown in the logs table (null when the LINE user is not linked). */
export class BeaconLogStudentDto {
  @ApiProperty() id!: string
  @ApiProperty({ example: '660112230038' }) studentCode!: string
  @ApiProperty({ example: 'Somchai Jaidee' }) name!: string
}

/** Nested beacon shown in the logs table (null for unregistered hwids). */
export class BeaconLogBeaconDto {
  @ApiProperty() id!: string
  @ApiProperty({ example: 'CS Room 101' }) name!: string
}

/** Beacon-log row (spec §18). rawPayload is returned by the detail endpoint only. */
export class BeaconLogResponseDto {
  @ApiProperty() id!: string
  @ApiProperty({ example: 'U1234567890abcdef1234567890abcdef' }) lineUserId!: string
  @ApiProperty({ type: BeaconLogStudentDto, nullable: true }) student!: BeaconLogStudentDto | null
  @ApiProperty({ type: BeaconLogBeaconDto, nullable: true }) beacon!: BeaconLogBeaconDto | null
  @ApiProperty({ example: '32af519e88' }) hwid!: string
  @ApiProperty({ example: 'enter' }) eventType!: string
  @ApiProperty({ example: '2026-08-22T00:00:00.000Z' }) eventTimestamp!: string
  @ApiProperty({ example: '22babee0-bdbe-43a5-a29a-ac8e6d1ba3c7' }) webhookEventId!: string
  @ApiProperty({ enum: ProcessingStatus }) processingStatus!: ProcessingStatus
  @ApiProperty({ example: '2026-08-22T00:00:00.000Z', description: 'เวลาที่ server รับ webhook' })
  createdAt!: string
}

export class BeaconLogDetailDto extends BeaconLogResponseDto {
  @ApiProperty({ description: 'เหตุการณ์ดิบจาก LINE ตามที่รับมา (debug/audit, spec §18)' })
  rawPayload!: unknown
}
