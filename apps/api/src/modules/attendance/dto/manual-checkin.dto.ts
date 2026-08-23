import { ApiProperty } from '@nestjs/swagger'
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator'

/**
 * Manual check-in (spec §19): the organizer selects the status themselves
 * (the flow's "Select status / reason" step) — it is NOT computed from the
 * clock. ABSENT is not selectable: absent is computed, never stored (§44).
 */
export class ManualCheckinDto {
  @ApiProperty({ description: 'รหัสนักศึกษา (id) ที่เช็คชื่อ' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  studentId!: string

  @ApiProperty({ enum: ['PRESENT', 'LATE', 'EXCUSED'], description: 'สถานะที่ organizer เลือก' })
  @IsIn(['PRESENT', 'LATE', 'EXCUSED'])
  status!: 'PRESENT' | 'LATE' | 'EXCUSED'

  @ApiProperty({ example: 'นักศึกษาปิด Bluetooth', description: 'เหตุผลที่ต้องเช็คชื่อแทน (spec §19)' })
  @IsString()
  @IsNotEmpty({ message: 'กรุณาระบุเหตุผลของการเช็คชื่อแทน' })
  @MaxLength(500)
  manualReason!: string
}
