import { ApiProperty } from '@nestjs/swagger'
import { IsIn, IsOptional } from 'class-validator'
import { BeaconStatus } from '../../../generated/prisma/client'
import { PaginationDto } from '../../../common/dto/pagination.dto'

/** Sortable fields (query param values are snake_case column names from spec §33). */
export const BEACON_SORT_FIELDS = ['created_at', 'updated_at', 'hwid', 'name', 'status'] as const

export type BeaconSortField = (typeof BEACON_SORT_FIELDS)[number]

/** snake_case (spec §33) → Prisma orderBy field */
const SORT_FIELD_TO_PRISMA: Record<BeaconSortField, string> = {
  created_at: 'createdAt',
  updated_at: 'updatedAt',
  hwid: 'hwid',
  name: 'name',
  status: 'status',
}

export class ListBeaconsDto extends PaginationDto {
  @ApiProperty({ enum: BeaconStatus, required: false })
  @IsOptional()
  @IsIn([BeaconStatus.ACTIVE, BeaconStatus.INACTIVE, BeaconStatus.MAINTENANCE])
  status?: BeaconStatus

  @ApiProperty({ enum: BEACON_SORT_FIELDS, required: false, default: 'created_at' })
  @IsOptional()
  @IsIn(BEACON_SORT_FIELDS)
  declare sort?: BeaconSortField
}

export function sortToPrismaField(sort: BeaconSortField | undefined): string {
  return SORT_FIELD_TO_PRISMA[sort ?? 'created_at']
}
