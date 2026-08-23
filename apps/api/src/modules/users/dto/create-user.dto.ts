import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, IsIn, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator'

export class CreateUserDto {
  @ApiProperty({ example: 'organizer@example.com' })
  @IsEmail({}, { message: 'รูปแบบอีเมลไม่ถูกต้อง' })
  @MaxLength(255)
  email!: string

  @ApiProperty({ example: 'somorganizer' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(50)
  username!: string

  @ApiProperty({ minLength: 8, description: 'รหัสผ่าน (argon2 ตาม design doc)' })
  @IsString()
  @MinLength(8, { message: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' })
  @MaxLength(128)
  password!: string

  @ApiProperty({ enum: ['ADMIN', 'ORGANIZER'], description: 'บทบาท (spec §28 Assign Role)' })
  @IsIn(['ADMIN', 'ORGANIZER'])
  role!: 'ADMIN' | 'ORGANIZER'
}
