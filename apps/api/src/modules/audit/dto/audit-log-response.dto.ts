import { ApiProperty } from '@nestjs/swagger'

export class AuditActorDto {
  @ApiProperty() id!: string
  @ApiProperty({ example: 'admin' }) username!: string
}

/** Audit-log row — old/new snapshots are returned on the detail endpoint only. */
export class AuditLogResponseDto {
  @ApiProperty() id!: string
  @ApiProperty({
    type: AuditActorDto,
    nullable: true,
    description: 'null เมื่อ actor เป็นนักศึกษา (LIFF self-service, spec §56)',
  })
  user!: AuditActorDto | null
  @ApiProperty({ example: 'STUDENT_CREATED' }) action!: string
  @ApiProperty({ example: 'STUDENT' }) entityType!: string
  @ApiProperty() entityId!: string
  @ApiProperty({ example: '2026-08-22T00:00:00.000Z' }) createdAt!: string
}

export class AuditLogDetailDto extends AuditLogResponseDto {
  @ApiProperty({ nullable: true }) oldValue!: unknown
  @ApiProperty({ nullable: true }) newValue!: unknown
}
