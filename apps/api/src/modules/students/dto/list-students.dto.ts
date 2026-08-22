import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator'
import { StudentStatus } from '../../../generated/prisma/client'
import { PaginationDto } from '../../../common/dto/pagination.dto'

/** Sortable fields (query param values are snake_case column names from spec §33). */
export const STUDENT_SORT_FIELDS = [
  'created_at',
  'updated_at',
  'student_code',
  'first_name',
  'last_name',
  'year',
  'status',
] as const

export type StudentSortField = (typeof STUDENT_SORT_FIELDS)[number]

/** snake_case (spec §33) → Prisma orderBy field */
const SORT_FIELD_TO_PRISMA: Record<StudentSortField, string> = {
  created_at: 'createdAt',
  updated_at: 'updatedAt',
  student_code: 'studentCode',
  first_name: 'firstName',
  last_name: 'lastName',
  year: 'year',
  status: 'status',
}

export class ListStudentsDto extends PaginationDto {
  @ApiProperty({ enum: StudentStatus, required: false })
  @IsOptional()
  @IsIn([StudentStatus.ACTIVE, StudentStatus.INACTIVE])
  status?: StudentStatus

  @ApiProperty({ required: false, minimum: 1, maximum: 8, example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8)
  year?: number

  @ApiProperty({ enum: STUDENT_SORT_FIELDS, required: false, default: 'created_at' })
  @IsOptional()
  @IsIn(STUDENT_SORT_FIELDS)
  declare sort?: StudentSortField
}

export function sortToPrismaField(sort: StudentSortField | undefined): string {
  return SORT_FIELD_TO_PRISMA[sort ?? 'created_at']
}
