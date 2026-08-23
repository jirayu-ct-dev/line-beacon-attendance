import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsOptional } from 'class-validator'

export class ExportActivityReportDto {
  @ApiPropertyOptional({ enum: ['csv', 'xlsx'], default: 'csv', description: 'รูปแบบไฟล์รายงาน (spec §44: CSV + Excel)' })
  @IsOptional()
  @IsIn(['csv', 'xlsx'])
  format?: 'csv' | 'xlsx'
}
