import { ApiProperty } from '@nestjs/swagger'
import { IsIn, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator'
import { PaginationDto } from '../../../common/dto/pagination.dto'
import { AUDIT_ACTIONS } from '../audit.service'

/** Sortable fields (query param values are snake_case column names from spec §33). */
export const AUDIT_LOG_SORT_FIELDS = ['created_at', 'action', 'entity_type'] as const

export type AuditLogSortField = (typeof AUDIT_LOG_SORT_FIELDS)[number]

const SORT_FIELD_TO_PRISMA: Record<AuditLogSortField, string> = {
  created_at: 'createdAt',
  action: 'action',
  entity_type: 'entityType',
}

/** Filters follow the beacon-logs pattern (spec §46 is not defined for audit logs). */
export class ListAuditLogsDto extends PaginationDto {
  @ApiProperty({ enum: AUDIT_ACTIONS, required: false })
  @IsOptional()
  @IsIn(Object.values(AUDIT_ACTIONS))
  action?: string

  @ApiProperty({ required: false, description: 'กรองตามผู้ใช้ (id)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  userId?: string

  @ApiProperty({ required: false, example: 'STUDENT', description: 'กรองตามชนิด entity' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  entityType?: string

  @ApiProperty({ required: false, example: '2026-08-22T00:00:00.000Z', description: 'ช่วงเวลา (เริ่มต้น)' })
  @IsOptional()
  @IsISO8601({}, { message: 'from ต้องเป็นวันที่รูปแบบ ISO 8601' })
  from?: string

  @ApiProperty({ required: false, example: '2026-08-23T23:59:59.000Z', description: 'ช่วงเวลา (สิ้นสุด)' })
  @IsOptional()
  @IsISO8601({}, { message: 'to ต้องเป็นวันที่รูปแบบ ISO 8601' })
  to?: string

  @ApiProperty({ enum: AUDIT_LOG_SORT_FIELDS, required: false, default: 'created_at' })
  @IsOptional()
  @IsIn(AUDIT_LOG_SORT_FIELDS)
  declare sort?: AuditLogSortField
}

export function sortToPrismaField(sort: AuditLogSortField | undefined): string {
  return SORT_FIELD_TO_PRISMA[sort ?? 'created_at']
}
