import { ApiProperty } from '@nestjs/swagger'
import { UserRole, UserStatus } from '../../../generated/prisma/client'

/** User payload returned by every users endpoint (never includes the hash). */
export class UserResponseDto {
  @ApiProperty() id!: string
  @ApiProperty({ example: 'organizer@example.com' }) email!: string
  @ApiProperty({ example: 'somorganizer' }) username!: string
  @ApiProperty({ enum: UserRole }) role!: UserRole
  @ApiProperty({ enum: UserStatus }) status!: UserStatus
  @ApiProperty({ example: '2026-08-22T00:00:00.000Z' }) createdAt!: string
  @ApiProperty({ example: '2026-08-22T00:00:00.000Z' }) updatedAt!: string
}
