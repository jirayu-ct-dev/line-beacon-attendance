import { ApiProperty } from '@nestjs/swagger'
import { IsIn, IsOptional } from 'class-validator'
import { UserRole, UserStatus } from '../../../generated/prisma/client'
import { PaginationDto } from '../../../common/dto/pagination.dto'

/** Sortable fields (query param values are snake_case column names from spec §33). */
export const USER_SORT_FIELDS = ['created_at', 'updated_at', 'email', 'username', 'role', 'status'] as const

export type UserSortField = (typeof USER_SORT_FIELDS)[number]

/** snake_case (spec §33) → Prisma orderBy field */
const SORT_FIELD_TO_PRISMA: Record<UserSortField, string> = {
  created_at: 'createdAt',
  updated_at: 'updatedAt',
  email: 'email',
  username: 'username',
  role: 'role',
  status: 'status',
}

export class ListUsersDto extends PaginationDto {
  @ApiProperty({ enum: UserRole, required: false })
  @IsOptional()
  @IsIn([UserRole.ADMIN, UserRole.ORGANIZER])
  role?: UserRole

  @ApiProperty({ enum: UserStatus, required: false })
  @IsOptional()
  @IsIn([UserStatus.ACTIVE, UserStatus.INACTIVE])
  status?: UserStatus

  @ApiProperty({ enum: USER_SORT_FIELDS, required: false, default: 'created_at' })
  @IsOptional()
  @IsIn(USER_SORT_FIELDS)
  declare sort?: UserSortField
}

export function sortToPrismaField(sort: UserSortField | undefined): string {
  return SORT_FIELD_TO_PRISMA[sort ?? 'created_at']
}
