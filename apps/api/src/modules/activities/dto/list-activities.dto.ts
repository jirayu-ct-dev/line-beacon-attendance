import { ApiProperty } from '@nestjs/swagger'
import { IsIn, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator'
import { ActivityStatus } from '../../../generated/prisma/client'
import { PaginationDto } from '../../../common/dto/pagination.dto'

/** Sortable fields (query param values are snake_case column names from spec §33). */
export const ACTIVITY_SORT_FIELDS = ['created_at', 'updated_at', 'name', 'start_at', 'status'] as const

export type ActivitySortField = (typeof ACTIVITY_SORT_FIELDS)[number]

/** snake_case (spec §33) → Prisma orderBy field */
const SORT_FIELD_TO_PRISMA: Record<ActivitySortField, string> = {
  created_at: 'createdAt',
  updated_at: 'updatedAt',
  name: 'name',
  start_at: 'startAt',
  status: 'status',
}

/** Filters per spec §46: Date (start_at range), Status, Organizer. */
export class ListActivitiesDto extends PaginationDto {
  @ApiProperty({ enum: ActivityStatus, required: false })
  @IsOptional()
  @IsIn([ActivityStatus.DRAFT, ActivityStatus.PUBLISHED, ActivityStatus.CANCELLED])
  status?: ActivityStatus

  @ApiProperty({ required: false, description: 'กรองตามผู้สร้าง (id) — มีความหมายเต็มที่กับ Admin' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  createdById?: string

  @ApiProperty({ required: false, example: '2026-09-01T00:00:00.000Z', description: 'ช่วงเวลาเริ่มกิจกรรม (เริ่มต้น)' })
  @IsOptional()
  @IsISO8601({}, { message: 'from ต้องเป็นวันที่รูปแบบ ISO 8601' })
  from?: string

  @ApiProperty({ required: false, example: '2026-09-30T23:59:59.000Z', description: 'ช่วงเวลาเริ่มกิจกรรม (สิ้นสุด)' })
  @IsOptional()
  @IsISO8601({}, { message: 'to ต้องเป็นวันที่รูปแบบ ISO 8601' })
  to?: string

  @ApiProperty({ enum: ACTIVITY_SORT_FIELDS, required: false, default: 'created_at' })
  @IsOptional()
  @IsIn(ACTIVITY_SORT_FIELDS)
  declare sort?: ActivitySortField
}

export function sortToPrismaField(sort: ActivitySortField | undefined): string {
  return SORT_FIELD_TO_PRISMA[sort ?? 'created_at']
}
