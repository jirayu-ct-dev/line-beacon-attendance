import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { Public } from '../../common/auth/public.decorator'
import { LinkLineDto } from './dto/link-line.dto'
import { MeResponseDto } from './dto/me-response.dto'
import { CurrentLineUser, LineAuthGuard, LineAuthUser } from './line-auth.guard'
import { LineLinkService } from './line-link.service'

/**
 * LIFF account linking (spec §7.1). No dashboard JWT — @Public() exempts the
 * global JwtAuthGuard and LineAuthGuard verifies the LINE ID Token instead.
 */
@Public()
@ApiTags('line')
@UseGuards(LineAuthGuard)
@Controller('line')
export class LineLinkController {
  constructor(private readonly linkService: LineLinkService) {}

  @Post('link')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Link this LINE account to a student (student code + birth date)',
    description:
      'Body: { studentCode (12 digits), birthDate (DDMMYYYY ค.ศ.) }. Max 5 failed attempts per student code per hour (429); conflicts answer 409.',
  })
  @ApiOkResponse({ type: MeResponseDto })
  // Backstop on top of the per-code domain limit: 10 requests/min per IP.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
    async link(@CurrentLineUser() line: LineAuthUser, @Body() dto: LinkLineDto): Promise<MeResponseDto> {
    return this.linkService.link(line.lineUserId, { name: line.name, picture: line.picture }, dto)
  }

  @Post('unlink')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Unlink the caller's own LINE account (idempotent)" })
  @ApiOkResponse({ schema: { type: 'object', example: { success: true, data: null } } })
  async unlink(@CurrentLineUser() line: LineAuthUser): Promise<null> {
    return this.linkService.unlink(line.lineUserId)
  }
}
