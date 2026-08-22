import { Controller, Get, Param, Query } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Roles } from '../../common/auth/roles.decorator'
import { UserRole } from '../../generated/prisma/client'
import { ListBeaconLogsDto } from './dto/list-beacon-logs.dto'
import { BeaconLogDetailDto, BeaconLogResponseDto } from './dto/beacon-log-response.dto'
import { BeaconLogsService } from './beacon-logs.service'

/** Admin-only beacon-log viewer (spec §18, §26, §35) — JWT guard is global. */
@ApiTags('beacon-logs')
@Roles(UserRole.ADMIN)
@Controller('beacon-logs')
export class BeaconLogsController {
  constructor(private readonly beaconLogsService: BeaconLogsService) {}

  @Get()
  @ApiOperation({
    summary: 'List beacon logs (paginated; filter by hwid/student/status/date range — spec §46)',
  })
  @ApiOkResponse({ type: BeaconLogResponseDto, isArray: true })
  async list(@Query() query: ListBeaconLogsDto) {
    return this.beaconLogsService.list(query)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a beacon log with its raw LINE payload (spec §18)' })
  @ApiOkResponse({ type: BeaconLogDetailDto })
  async getById(@Param('id') id: string): Promise<BeaconLogDetailDto> {
    return this.beaconLogsService.getById(id)
  }
}
