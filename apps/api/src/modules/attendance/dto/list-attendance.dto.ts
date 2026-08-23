import { ApiProperty } from '@nestjs/swagger'
import { IsIn, IsOptional } from 'class-validator'
import { AttendanceStatus, CheckinMethod } from '../../../generated/prisma/client'
import { PaginationDto } from '../../../common/dto/pagination.dto'

/** Sortable fields (query param values are snake_case column names from spec §33). */
export const ATTENDANCE_SORT_FIELDS = ['check_in_at', 'status', 'method', 'created_at'] as const

export type AttendanceSortField = (typeof ATTENDANCE_SORT_FIELDS)[number]

/** snake_case (spec §33) → Prisma orderBy field */
const SORT_FIELD_TO_PRISMA: Record<AttendanceSortField, string> = {
  check_in_at: 'checkInAt',
  status: 'status',
  method: 'checkinMethod',
  created_at: 'createdAt',
}

/**
 * Filters per spec §46 (Status, Method; search matches student code/name per
 * §25). ABSENT is not offered — absent is computed, never a stored row (§44).
 */
export class ListAttendanceDto extends PaginationDto {
  @ApiProperty({ enum: ['PRESENT', 'LATE', 'EXCUSED'], required: false })
  @IsOptional()
  @IsIn(['PRESENT', 'LATE', 'EXCUSED'])
  status?: AttendanceStatus

  @ApiProperty({ enum: CheckinMethod, required: false })
  @IsOptional()
  @IsIn([CheckinMethod.BEACON, CheckinMethod.MANUAL])
  method?: CheckinMethod

  @ApiProperty({ enum: ATTENDANCE_SORT_FIELDS, required: false, default: 'check_in_at' })
  @IsOptional()
  @IsIn(ATTENDANCE_SORT_FIELDS)
  declare sort?: AttendanceSortField
}

export function sortToPrismaField(sort: AttendanceSortField | undefined): string {
  return SORT_FIELD_TO_PRISMA[sort ?? 'check_in_at']
}
