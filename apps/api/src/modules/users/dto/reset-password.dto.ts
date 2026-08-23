import { ApiProperty } from '@nestjs/swagger'
import { IsString, MaxLength, MinLength } from 'class-validator'

export class ResetPasswordDto {
  @ApiProperty({ minLength: 8, description: 'รหัสผ่านใหม่' })
  @IsString()
  @MinLength(8, { message: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' })
  @MaxLength(128)
  newPassword!: string
}
