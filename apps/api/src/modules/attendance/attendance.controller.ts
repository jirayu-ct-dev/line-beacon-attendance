import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { AuthUser, CurrentUser } from '../../common/auth/current-user.decorator'
import { Roles } from '../../common/auth/roles.decorator'
import { UserRole } from '../../generated/prisma/client'
import { ListAttendanceDto } from './dto/list-attendance.dto'
import { ManualCheckinDto } from './dto/manual-checkin.dto'
import { UpdateAttendanceDto } from './dto/update-attendance.dto'
import { AttendanceRowDto, StudentAttendanceRowDto } from './dto/attendance-response.dto'
import { AttendanceService } from './attendance.service'

/**
 * Attendance queries and manual management (spec §19, §25, §35). Activity
 * endpoints follow activities ownership (§29); the per-student history is
 * admin-only because students themselves are an admin domain (spec §27).
 */
@ApiTags('attendance')
@Roles(UserRole.ADMIN, UserRole.ORGANIZER)
@Controller()
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get('activities/:id/attendances')
  @ApiOperation({ summary: 'List an activity\'s attendance rows (search by student code/name — spec §25)' })
  @ApiOkResponse({ type: AttendanceRowDto, isArray: true })
  async listByActivity(
    @Param('id') id: string,
    @Query() query: ListAttendanceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.attendanceService.listByActivity(id, query, user)
  }

  @Post('activities/:id/attendances/manual')
  @ApiOperation({ summary: 'Manual check-in — organizer selects status + reason, allowed outside the window (spec §19)' })
  @ApiOkResponse({ type: AttendanceRowDto })
  async manualCheckin(
    @Param('id') id: string,
    @Body() dto: ManualCheckinDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AttendanceRowDto> {
    return this.attendanceService.manualCheckin(id, dto, user)
  }

  @Patch('activities/:id/attendances/:attendanceId')
  @ApiOperation({ summary: 'Manually change an attendance status (audited — spec §56)' })
  @ApiOkResponse({ type: AttendanceRowDto })
  async updateAttendance(
    @Param('id') id: string,
    @Param('attendanceId') attendanceId: string,
    @Body() dto: UpdateAttendanceDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AttendanceRowDto> {
    return this.attendanceService.updateAttendance(id, attendanceId, dto, user)
  }

  @Get('students/:id/attendances')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "A student's attendance history across activities (admin only — spec §27, §35)" })
  @ApiOkResponse({ type: StudentAttendanceRowDto, isArray: true })
  async listByStudent(@Param('id') id: string, @Query() query: ListAttendanceDto) {
    return this.attendanceService.listByStudent(id, query)
  }
}
