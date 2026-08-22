import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

export class LoginDto {
  @ApiProperty({ example: 'admin', description: 'Username or email' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  username_or_email!: string

  @ApiProperty({ example: 'change-me-admin', writeOnly: true })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  password!: string
}
