import { ApiProperty } from '@nestjs/swagger'
import { BeaconStatus } from '../../../generated/prisma/client'

/** Beacon payload returned by every beacons endpoint. */
export class BeaconResponseDto {
  @ApiProperty() id!: string
  @ApiProperty({ example: '32af519e88' }) hwid!: string
  @ApiProperty({ example: 'CS Room 101' }) name!: string
  @ApiProperty({ nullable: true, example: 'CS101' }) location!: string | null
  @ApiProperty({ nullable: true, example: 'บีคอนห้อง CS101' }) description!: string | null
  @ApiProperty({ enum: BeaconStatus }) status!: BeaconStatus
  @ApiProperty({ example: '2026-08-22T00:00:00.000Z' }) createdAt!: string
  @ApiProperty({ example: '2026-08-22T00:00:00.000Z' }) updatedAt!: string
}
