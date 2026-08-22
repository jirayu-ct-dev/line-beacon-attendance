import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

export class LinkBeaconDto {
  @ApiProperty({ description: 'รหัสบีคอน (id) ที่จะลิงก์กับกิจกรรม' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  beaconId!: string
}
