import { Body, Controller, Get, HttpCode, Post, Res, Request } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { Response } from 'express'
import { CurrentUser, AuthUser } from '../../common/auth/current-user.decorator'
import { Public } from '../../common/auth/public.decorator'
import { clearAuthCookies, readRefreshCookie, setAuthCookies } from './auth-cookies'
import { AuthService } from './auth.service'
import { LoginDto } from './dto/login.dto'
import { UserProfileDto } from './dto/user-profile.dto'

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login with username/email + password (sets auth cookies)' })
  @ApiOkResponse({ type: UserProfileDto })
  // Stricter override of the global throttler: 10 attempts/min per IP (spec §30.8)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response): Promise<UserProfileDto> {
    const result = await this.authService.login(dto)
    setAuthCookies(res, result, this.cookieSecure())
    return result.user
  }

  @Public() // refresh works with an expired/absent access token
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate refresh token and issue a new access token' })
  @ApiOkResponse({ type: UserProfileDto })
  async refresh(
    @Request() req: { cookies?: Record<string, string> },
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserProfileDto> {
    const result = await this.authService.refresh(readRefreshCookie(req))
    setAuthCookies(res, result, this.cookieSecure())
    return result.user
  }

  @Public() // idempotent — works whether or not the caller is still logged in
  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoke refresh token and clear auth cookies (idempotent)' })
  @ApiOkResponse({ schema: { type: 'object', example: { success: true, data: null } } })
  async logout(
    @Request() req: { cookies?: Record<string, string> },
    @Res({ passthrough: true }) res: Response,
  ): Promise<null> {
    await this.authService.logout(readRefreshCookie(req))
    clearAuthCookies(res, this.cookieSecure())
    return null
  }

  @Get('me')
  @ApiOperation({ summary: 'Current user profile' })
  @ApiOkResponse({ type: UserProfileDto })
  async me(@CurrentUser() user: AuthUser): Promise<UserProfileDto> {
    return this.authService.getProfile(user.id)
  }

  private cookieSecure(): boolean {
    return this.configService.get<string>('COOKIE_SECURE') === 'true'
  }
}
