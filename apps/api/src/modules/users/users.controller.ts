import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { AuthUser, CurrentUser } from '../../common/auth/current-user.decorator'
import { Roles } from '../../common/auth/roles.decorator'
import { UserStatus, UserRole } from '../../generated/prisma/client'
import { CreateUserDto } from './dto/create-user.dto'
import { UpdateUserDto } from './dto/update-user.dto'
import { ListUsersDto } from './dto/list-users.dto'
import { ResetPasswordDto } from './dto/reset-password.dto'
import { UserResponseDto } from './dto/user-response.dto'
import { UsersService } from './users.service'

/** Organizer/admin account management (spec §28) — admin-only. */
@ApiTags('users')
@Roles(UserRole.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users (paginated; search by email/username, filter by role/status)' })
  @ApiOkResponse({ type: UserResponseDto, isArray: true })
  async list(@Query() query: ListUsersDto) {
    return this.usersService.list(query)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user by id' })
  @ApiOkResponse({ type: UserResponseDto })
  async getById(@Param('id') id: string): Promise<UserResponseDto> {
    return this.usersService.getById(id)
  }

  @Post()
  @ApiOperation({ summary: 'Create an organizer/admin account (spec §28)' })
  @ApiOkResponse({ type: UserResponseDto })
  async create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthUser): Promise<UserResponseDto> {
    return this.usersService.create(dto, user.id)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update email/username/role (password + status have dedicated endpoints)' })
  @ApiOkResponse({ type: UserResponseDto })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthUser,
  ): Promise<UserResponseDto> {
    return this.usersService.update(id, dto, user)
  }

  @Post(':id/disable')
  @ApiOperation({ summary: 'Disable a user (status INACTIVE — the "delete"; revokes sessions)' })
  @ApiOkResponse({ type: UserResponseDto })
  async disable(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<UserResponseDto> {
    return this.usersService.setStatus(id, UserStatus.INACTIVE, user)
  }

  @Post(':id/enable')
  @ApiOperation({ summary: 'Enable a user (status ACTIVE)' })
  @ApiOkResponse({ type: UserResponseDto })
  async enable(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<UserResponseDto> {
    return this.usersService.setStatus(id, UserStatus.ACTIVE, user)
  }

  @Post(':id/reset-password')
  @ApiOperation({ summary: "Reset a user's password (revokes all their sessions)" })
  @ApiOkResponse({ type: UserResponseDto })
  async resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() user: AuthUser,
  ): Promise<UserResponseDto> {
    return this.usersService.resetPassword(id, dto.newPassword, user)
  }
}
