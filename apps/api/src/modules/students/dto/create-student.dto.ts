import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator'
import { STUDENT_CODE_RE } from '../student-validation'

export class CreateStudentDto {
  @ApiProperty({ example: '660112230038', description: 'รหัสนักศึกษา ตัวเลข 12 หลัก' })
  @IsString()
  @Matches(STUDENT_CODE_RE, { message: 'รหัสนักศึกษาต้องเป็นตัวเลข 12 หลัก' })
  studentCode!: string

  @ApiProperty({ example: 'Somchai' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  firstName!: string

  @ApiProperty({ example: 'Jaidee' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  lastName!: string

  @ApiProperty({ example: '2004-01-01', description: 'วันเกิด (ค.ศ.) รูปแบบ YYYY-MM-DD' })
  @IsString()
  birthDate!: string

  @ApiProperty({ example: 3, minimum: 1, maximum: 8, description: 'ชั้นปี 1–8' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8)
  year!: number

  @ApiProperty({ required: false, nullable: true, example: 'student@example.com' })
  @IsOptional()
  @IsEmail({}, { message: 'รูปแบบอีเมลไม่ถูกต้อง' })
  email?: string
}
