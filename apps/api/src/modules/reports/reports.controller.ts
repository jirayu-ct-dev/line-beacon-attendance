import { Controller, Get, Param, Query, Res } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Response } from 'express'
import { AuthUser, CurrentUser } from '../../common/auth/current-user.decorator'
import { Roles } from '../../common/auth/roles.decorator'
import { UserRole } from '../../generated/prisma/client'
import { ExportActivityReportDto } from './dto/export-report.dto'
import { ActivityReportDto, StudentReportDto } from './dto/report-response.dto'
import { ReportsService } from './reports.service'

/**
 * Reports (spec §44, §35). Activity reports follow activities ownership
 * (§29); the per-student report is admin-only because students themselves
 * are an admin domain (spec §27) — same rule as /students/:id/attendances.
 */
@ApiTags('reports')
@Roles(UserRole.ADMIN, UserRole.ORGANIZER)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('activities/:id')
  @ApiOperation({ summary: 'Activity attendance report — header + §44 counts + full list' })
  @ApiOkResponse({ type: ActivityReportDto })
  async activityReport(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<ActivityReportDto> {
    return this.reportsService.activityReport(id, user)
  }

  @Get('activities/:id/export')
  @ApiOperation({ summary: 'Export the activity report as CSV or Excel (spec §44)' })
  async exportActivity(
    @Param('id') id: string,
    @Query() query: ExportActivityReportDto,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { file, contentType, filename } = await this.reportsService.exportActivity(id, query.format ?? 'csv', user)
    res.setHeader('Content-Type', contentType)
    // RFC 5987: ASCII fallback plus the UTF-8 form so Thai filenames survive
    const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '')
    res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`)
    return file
  }

  @Get('students/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "A student's attendance report across activities (admin only — spec §27, §35)" })
  @ApiOkResponse({ type: StudentReportDto })
  async studentReport(@Param('id') id: string): Promise<StudentReportDto> {
    return this.reportsService.studentReport(id)
  }
}
