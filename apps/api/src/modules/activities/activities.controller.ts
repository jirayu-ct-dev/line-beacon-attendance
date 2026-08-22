import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { AuthUser, CurrentUser } from '../../common/auth/current-user.decorator'
import { Roles } from '../../common/auth/roles.decorator'
import { UserRole } from '../../generated/prisma/client'
import { CreateActivityDto } from './dto/create-activity.dto'
import { ListActivitiesDto } from './dto/list-activities.dto'
import { LinkBeaconDto } from './dto/link-beacon.dto'
import { ActivityDetailDto, ActivityResponseDto } from './dto/activity-response.dto'
import { UpdateActivityDto } from './dto/update-activity.dto'
import { BeaconResponseDto } from '../beacons/dto/beacon-response.dto'
import { ActivitiesService } from './activities.service'

/**
 * Activity management (spec §11–§12, §29, §35). Both roles may use every
 * endpoint; the service enforces ownership — organizers only reach their own
 * activities, admins everything.
 */
@ApiTags('activities')
@Roles(UserRole.ADMIN, UserRole.ORGANIZER)
@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Get()
  @ApiOperation({
    summary: 'List activities (paginated; own activities for organizers, all for admins — spec §29)',
  })
  @ApiOkResponse({ type: ActivityResponseDto, isArray: true })
  async list(@Query() query: ListActivitiesDto, @CurrentUser() user: AuthUser) {
    return this.activitiesService.list(query, user)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an activity with its linked beacons' })
  @ApiOkResponse({ type: ActivityDetailDto })
  async getById(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<ActivityDetailDto> {
    return this.activitiesService.getById(id, user)
  }

  @Post()
  @ApiOperation({ summary: 'Create a DRAFT activity (spec §11)' })
  @ApiOkResponse({ type: ActivityDetailDto })
  async create(@Body() dto: CreateActivityDto, @CurrentUser() user: AuthUser): Promise<ActivityDetailDto> {
    return this.activitiesService.create(dto, user.id)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an activity (status only moves via publish/cancel — spec §35)' })
  @ApiOkResponse({ type: ActivityDetailDto })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateActivityDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ActivityDetailDto> {
    return this.activitiesService.update(id, dto, user)
  }

  @Post(':id/publish')
  @ApiOperation({ summary: 'DRAFT → PUBLISHED (needs ≥1 beacon and a non-overlapping window — spec §38, §54.4)' })
  @ApiOkResponse({ type: ActivityDetailDto })
  async publish(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<ActivityDetailDto> {
    return this.activitiesService.publish(id, user)
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel an activity (status CANCELLED — this is the "delete", spec §35)' })
  @ApiOkResponse({ type: ActivityDetailDto })
  async cancel(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<ActivityDetailDto> {
    return this.activitiesService.cancel(id, user)
  }

  @Get(':id/beacons')
  @ApiOperation({ summary: 'List the beacons linked to an activity (spec §14)' })
  @ApiOkResponse({ type: BeaconResponseDto, isArray: true })
  async listBeacons(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<BeaconResponseDto[]> {
    return this.activitiesService.listBeacons(id, user)
  }

  @Post(':id/beacons')
  @ApiOperation({ summary: 'Link a beacon (overlap-checked when the activity is PUBLISHED — spec §38)' })
  @ApiOkResponse({ type: BeaconResponseDto })
  async linkBeacon(
    @Param('id') id: string,
    @Body() dto: LinkBeaconDto,
    @CurrentUser() user: AuthUser,
  ): Promise<BeaconResponseDto> {
    return this.activitiesService.linkBeacon(id, dto.beaconId, user)
  }

  @Delete(':id/beacons/:beaconId')
  @ApiOperation({ summary: 'Unlink a beacon (idempotent)' })
  @ApiOkResponse({ type: BeaconResponseDto })
  async unlinkBeacon(
    @Param('id') id: string,
    @Param('beaconId') beaconId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<BeaconResponseDto> {
    return this.activitiesService.unlinkBeacon(id, beaconId, user)
  }
}
