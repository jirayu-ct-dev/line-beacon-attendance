import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { UserRole } from '../../generated/prisma/client'

/** Shape attached to request.user by JwtAuthGuard (JWT payload { sub, role }). */
export interface AuthUser {
  id: string
  role: UserRole
}

/** Parameter decorator: `@CurrentUser() user: AuthUser` */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthUser => {
  return context.switchToHttp().getRequest().user
})
