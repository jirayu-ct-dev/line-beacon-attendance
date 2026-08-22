import { ApiProperty } from '@nestjs/swagger'
import { StudentStatus } from '../../../generated/prisma/client'

/** Student payload returned by every students endpoint. */
export class StudentResponseDto {
  @ApiProperty() id!: string
  @ApiProperty({ example: '660112230038' }) studentCode!: string
  @ApiProperty({ example: 'Somchai' }) firstName!: string
  @ApiProperty({ example: 'Jaidee' }) lastName!: string
  @ApiProperty({ example: '2004-01-01', description: 'วันเกิด (ค.ศ.) รูปแบบ YYYY-MM-DD' }) birthDate!: string
  @ApiProperty({ example: 3 }) year!: number
  @ApiProperty({ nullable: true, example: 'student@example.com' }) email!: string | null
  @ApiProperty({ enum: StudentStatus }) status!: StudentStatus
  @ApiProperty({ description: 'เชื่อมต่อบัญชี LINE แล้วหรือไม่' }) lineLinked!: boolean
  @ApiProperty({ example: '2026-08-22T00:00:00.000Z' }) createdAt!: string
  @ApiProperty({ example: '2026-08-22T00:00:00.000Z' }) updatedAt!: string
}
