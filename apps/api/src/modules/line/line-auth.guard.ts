import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { createParamDecorator } from '@nestjs/common'
import type { LineIdTokenPayload } from './line-token.service'
import { LineTokenService } from './line-token.service'

/**
 * LineAuthGuard (design doc §5.2): route-level guard for the LIFF endpoints
 * (POST /line/link, POST /line/unlink, GET /me*). Routes using it must also be
 * @Public() so the global JwtAuthGuard does not demand a dashboard JWT.
 *
 * Expects `Authorization: Bearer <LINE ID Token>`, verifies it with
 * LineTokenService (never trusts a client-sent line_user_id — spec §7.1) and
 * attaches the verified identity to request.lineAuth.
 */
@Injectable()
export class LineAuthGuard implements CanActivate {
  constructor(private readonly tokenService: LineTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string }
      lineAuth?: LineAuthUser
    }>()

    const header = request.headers.authorization
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : undefined
    if (!token) {
      throw new UnauthorizedException('กรุณายืนยันตัวตนผ่าน LINE ก่อนใช้งาน')
    }

    request.lineAuth = await this.tokenService.verifyIdToken(token)
    return true
  }
}

/** Verified LINE identity attached to request.lineAuth by LineAuthGuard (same shape as the verified token claims). */
export type LineAuthUser = LineIdTokenPayload

/** Parameter decorator: `@CurrentLineUser() line: LineAuthUser` */
export const CurrentLineUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): LineAuthUser => {
    return context.switchToHttp().getRequest().lineAuth
  },
)
