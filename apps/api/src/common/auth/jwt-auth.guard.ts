import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { IS_PUBLIC_KEY } from './public.decorator'
import { AuthUser } from './current-user.decorator'

/**
 * Global guard: every route requires a valid JWT unless decorated with @Public().
 * Accepts the token from the httpOnly `access_token` cookie (dashboard web client)
 * or an `Authorization: Bearer <token>` header (programmatic clients).
 * On success attaches { id, role } to request.user.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string }
      cookies?: Record<string, string>
      user?: AuthUser
    }>()

    const headerToken = bearerToken(request.headers.authorization)
    const token = request.cookies?.['access_token'] ?? headerToken
    if (!token) {
      throw new UnauthorizedException('กรุณาเข้าสู่ระบบก่อนใช้งาน')
    }

    try {
      const payload = await this.jwtService.verifyAsync<{ sub: string; role: AuthUser['role'] }>(token)
      request.user = { id: payload.sub, role: payload.role }
      return true
    } catch {
      throw new UnauthorizedException('เซสชันไม่ถูกต้องหรือหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง')
    }
  }
}

function bearerToken(header: string | undefined): string | undefined {
  if (!header?.startsWith('Bearer ')) return undefined
  return header.slice('Bearer '.length).trim() || undefined
}
