import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Paginated, PaginationDto } from '../../common/dto/pagination.dto'
import { Public } from '../../common/auth/public.decorator'
import { AttendanceItemDto, MeResponseDto, MyActivityItemDto } from './dto/me-response.dto'
import { CurrentLineUser, LineAuthGuard, LineAuthUser } from './line-auth.guard'
import { LineLinkService } from './line-link.service'

/**
 * Student self-service endpoints (spec §35): authenticated with a LINE ID
 * Token (LineAuthGuard), NOT a dashboard JWT — hence @Public().
 */
@Public()
@ApiTags('me')
@UseGuards(LineAuthGuard)
@Controller('me')
export class MeController {
  constructor(private readonly linkService: LineLinkService) {}

  @Get()
  @ApiOperation({ summary: 'Student profile + LINE link status of the caller (LIFF)' })
  @ApiOkResponse({ type: MeResponseDto })
  async me(@CurrentLineUser() line: LineAuthUser): Promise<MeResponseDto> {
    return this.linkService.getMe(line.lineUserId)
  }

  @Get('attendances')
  @ApiOperation({ summary: "Caller's own attendance history, newest first (created by the attendance engine (spec §10))" })
  @ApiOkResponse({ type: AttendanceItemDto, isArray: true })
  async attendances(
    @CurrentLineUser() line: LineAuthUser,
    @Query() query: PaginationDto,
  ): Promise<Paginated<AttendanceItemDto>> {
    return this.linkService.getMyAttendances(line.lineUserId, query)
  }

  @Get('activities')
  @ApiOperation({ summary: 'PUBLISHED activities for the LIFF activities page (spec §35), newest start first' })
  @ApiOkResponse({ type: MyActivityItemDto, isArray: true })
  async activities(
    @CurrentLineUser() line: LineAuthUser,
    @Query() query: PaginationDto,
  ): Promise<Paginated<MyActivityItemDto>> {
    return this.linkService.getMyActivities(line.lineUserId, query)
  }

  @Get('activities/:id')
  @ApiOperation({ summary: 'One PUBLISHED activity + the caller’s own attendance (LIFF detail view)' })
  @ApiOkResponse({ type: MyActivityItemDto })
  async activity(@CurrentLineUser() line: LineAuthUser, @Param('id') id: string): Promise<MyActivityItemDto> {
    return this.linkService.getMyActivity(line.lineUserId, id)
  }
}
