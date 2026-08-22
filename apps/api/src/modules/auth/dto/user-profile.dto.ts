import { ApiProperty } from '@nestjs/swagger'
import { UserRole } from '../../../generated/prisma/client'

/** Public shape of a user profile (never exposes password_hash). */
export class UserProfileDto {
  @ApiProperty({ example: 'clx…cuid' })
  id!: string

  @ApiProperty({ example: 'admin@example.com' })
  email!: string

  @ApiProperty({ example: 'admin' })
  username!: string

  @ApiProperty({ enum: UserRole, example: UserRole.ADMIN })
  role!: UserRole
}
