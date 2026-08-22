import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator'

/** LINE Simple Beacon HWID: 10 hex chars (5 bytes) issued by manager.line.biz (spec §13). */
export const HWID_RE = /^[0-9a-fA-F]{10}$/

export class CreateBeaconDto {
  @ApiProperty({ example: '32af519e88', description: 'HWID ที่ LINE ออกให้ เลขฐานสิบหก 10 ตัวอักษร' })
  @IsString()
  @Matches(HWID_RE, { message: 'HWID ต้องเป็นเลขฐานสิบหก 10 ตัวอักษร (0-9, a-f)' })
  hwid!: string

  @ApiProperty({ example: 'CS Room 101' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string

  @ApiProperty({ required: false, nullable: true, example: 'CS101' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string

  @ApiProperty({ required: false, nullable: true, example: 'บีคอนห้อง CS101' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string
}
