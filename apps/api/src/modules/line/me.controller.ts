import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Paginated, PaginationDto } from '../../common/dto/pagination.dto'
import { Public } from '../../common/auth/public.decorator'
import { AttendanceItemDto, MeResponseDto } from './dto/me-response.dto'
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
  @ApiOperation({ summary: "Caller's own attendance history, newest first (may be empty until Phase 7)" })
  @ApiOkResponse({ type: AttendanceItemDto, isArray: true })
  async attendances(
    @CurrentLineUser() line: LineAuthUser,
    @Query() query: PaginationDto,
  ): Promise<Paginated<AttendanceItemDto>> {
    return this.linkService.getMyAttendances(line.lineUserId, query)
  }
}
