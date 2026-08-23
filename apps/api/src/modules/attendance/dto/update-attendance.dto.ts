import { ApiProperty } from '@nestjs/swagger'
import { IsIn } from 'class-validator'

/**
 * Manual attendance change (spec §19/§31): the status is the editable field
 * (EXCUSED can only ever be set here — the beacon pipeline creates only
 * PRESENT/LATE). ABSENT is allowed so a wrongly checked-in student can be
 * voided; §44 then counts them as absent because no Present/Late/Excused row
 * remains for the reports.
 */
export class UpdateAttendanceDto {
  @ApiProperty({ enum: ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'] })
  @IsIn(['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'])
  status!: 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED'
}
