import { Controller, Get } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { AuthUser, CurrentUser } from '../../common/auth/current-user.decorator'
import { Roles } from '../../common/auth/roles.decorator'
import { UserRole } from '../../generated/prisma/client'
import { DashboardResponseDto } from './dto/dashboard-response.dto'
import { DashboardService } from './dashboard.service'

/** Dashboard overview (spec §23, §45) — both roles, scoped by ownership (§29). */
@ApiTags('dashboard')
@Roles(UserRole.ADMIN, UserRole.ORGANIZER)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @ApiOperation({ summary: 'Overview stats + recent/open-checkin activities (own activities for organizers)' })
  @ApiOkResponse({ type: DashboardResponseDto })
  async overview(@CurrentUser() user: AuthUser): Promise<DashboardResponseDto> {
    return this.dashboardService.overview(user)
  }
}
