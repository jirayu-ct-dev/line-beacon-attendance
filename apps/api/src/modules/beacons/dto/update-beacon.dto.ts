import { ApiProperty, PartialType } from '@nestjs/swagger'
import { IsIn, IsOptional } from 'class-validator'
import { BeaconStatus } from '../../../generated/prisma/client'
import { CreateBeaconDto } from './create-beacon.dto'

/** PATCH semantics: every field optional; omitted fields keep their current value. */
export class UpdateBeaconDto extends PartialType(CreateBeaconDto) {
  /** PATCH is the only path to MAINTENANCE; ACTIVE/INACTIVE normally go through disable/enable. */
  @ApiProperty({
    required: false,
    enum: BeaconStatus,
    description: 'เปลี่ยนสถานะได้ทุกค่า (เช่น MAINTENANCE) — สถานะ ACTIVE/INACTIVE มี endpoint เฉพาะ',
  })
  @IsOptional()
  @IsIn([BeaconStatus.ACTIVE, BeaconStatus.INACTIVE, BeaconStatus.MAINTENANCE])
  declare status?: BeaconStatus
}
