import { SetMetadata } from '@nestjs/common'
import { AuthUser } from './current-user.decorator'

export const ROLES_KEY = 'roles'

/**
 * Restricts a route to the given roles, e.g. `@Roles(UserRole.ADMIN)` for
 * admin-only routes (spec §29). Evaluated by RolesGuard.
 */
export const Roles = (...roles: AuthUser['role'][]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles)
