import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { AuthUser, CurrentUser } from '../../common/auth/current-user.decorator'
import { Roles } from '../../common/auth/roles.decorator'
import { BeaconStatus, UserRole } from '../../generated/prisma/client'
import { CreateBeaconDto } from './dto/create-beacon.dto'
import { ListBeaconsDto } from './dto/list-beacons.dto'
import { BeaconResponseDto } from './dto/beacon-response.dto'
import { UpdateBeaconDto } from './dto/update-beacon.dto'
import { BeaconsService } from './beacons.service'

/**
 * Beacon management (spec §13, §35). Both roles may read beacons — organizers
 * pick them when linking activities (spec §23–§24); mutations are admin-only.
 */
@ApiTags('beacons')
@Roles(UserRole.ADMIN, UserRole.ORGANIZER)
@Controller('beacons')
export class BeaconsController {
  constructor(private readonly beaconsService: BeaconsService) {}

  @Get()
  @ApiOperation({ summary: 'List beacons (paginated; search by hwid/name/location, filter by status)' })
  @ApiOkResponse({ type: BeaconResponseDto, isArray: true })
  async list(@Query() query: ListBeaconsDto) {
    return this.beaconsService.list(query)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a beacon by id' })
  @ApiOkResponse({ type: BeaconResponseDto })
  async getById(@Param('id') id: string): Promise<BeaconResponseDto> {
    return this.beaconsService.getById(id)
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Register a beacon (spec §13 — HWID must be issued by LINE)' })
  @ApiOkResponse({ type: BeaconResponseDto })
  async create(@Body() dto: CreateBeaconDto, @CurrentUser() user: AuthUser): Promise<BeaconResponseDto> {
    return this.beaconsService.create(dto, user.id)
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update a beacon (no hard delete — spec §35)' })
  @ApiOkResponse({ type: BeaconResponseDto })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateBeaconDto,
    @CurrentUser() user: AuthUser,
  ): Promise<BeaconResponseDto> {
    return this.beaconsService.update(id, dto, user.id)
  }

  @Post(':id/disable')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Disable a beacon (status INACTIVE — this is the "delete", spec §35)' })
  @ApiOkResponse({ type: BeaconResponseDto })
  async disable(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<BeaconResponseDto> {
    return this.beaconsService.setStatus(id, BeaconStatus.INACTIVE, user.id)
  }

  @Post(':id/enable')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Enable a beacon (status ACTIVE)' })
  @ApiOkResponse({ type: BeaconResponseDto })
  async enable(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<BeaconResponseDto> {
    return this.beaconsService.setStatus(id, BeaconStatus.ACTIVE, user.id)
  }
}
