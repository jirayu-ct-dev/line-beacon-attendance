import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ROLES_KEY } from './roles.decorator'
import { AuthUser } from './current-user.decorator'

/**
 * Global guard (runs after JwtAuthGuard). Rejects requests whose role is not in
 * the @Roles(...) list of the handler/class. Resource ownership checks (spec §29)
 * stay in services — this guard only covers role-based access.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AuthUser['role'][]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!required || required.length === 0) return true

    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user
    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException('คุณไม่มีสิทธิ์เข้าถึงทรัพยากรนี้')
    }
    return true
  }
}
