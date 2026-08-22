import { ApiProperty } from '@nestjs/swagger'
import { IsIn, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator'
import { ProcessingStatus } from '../../../generated/prisma/client'
import { PaginationDto } from '../../../common/dto/pagination.dto'

/** Sortable fields (query param values are snake_case column names from spec §33). */
export const BEACON_LOG_SORT_FIELDS = ['created_at', 'event_timestamp', 'hwid', 'processing_status'] as const

export type BeaconLogSortField = (typeof BEACON_LOG_SORT_FIELDS)[number]

/** snake_case (spec §33) → Prisma orderBy field */
const SORT_FIELD_TO_PRISMA: Record<BeaconLogSortField, string> = {
  created_at: 'createdAt',
  event_timestamp: 'eventTimestamp',
  hwid: 'hwid',
  processing_status: 'processingStatus',
}

/** Filters per spec §46: HWID, Student, Processing Status, Date Range. */
export class ListBeaconLogsDto extends PaginationDto {
  @ApiProperty({ required: false, example: '32af519e88', description: 'กรองตรงตาม HWID' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  hwid?: string

  @ApiProperty({ required: false, description: 'กรองตามรหัสนักศึกษา (id)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  studentId?: string

  @ApiProperty({ enum: ProcessingStatus, required: false, description: 'สถานะการประมวลผล' })
  @IsOptional()
  @IsIn(Object.values(ProcessingStatus))
  status?: ProcessingStatus

  @ApiProperty({
    required: false,
    example: '2026-08-22T00:00:00.000Z',
    description: 'ช่วงเวลาเริ่มต้น (เทียบกับ event timestamp ตามสเปก §6)',
  })
  @IsOptional()
  @IsISO8601({}, { message: 'from ต้องเป็นวันที่รูปแบบ ISO 8601' })
  from?: string

  @ApiProperty({ required: false, example: '2026-08-23T23:59:59.000Z', description: 'ช่วงเวลาสิ้นสุด' })
  @IsOptional()
  @IsISO8601({}, { message: 'to ต้องเป็นวันที่รูปแบบ ISO 8601' })
  to?: string

  @ApiProperty({ enum: BEACON_LOG_SORT_FIELDS, required: false, default: 'created_at' })
  @IsOptional()
  @IsIn(BEACON_LOG_SORT_FIELDS)
  declare sort?: BeaconLogSortField
}

export function sortToPrismaField(sort: BeaconLogSortField | undefined): string {
  return SORT_FIELD_TO_PRISMA[sort ?? 'created_at']
}
