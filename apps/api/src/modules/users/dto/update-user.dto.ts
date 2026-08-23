import { PartialType } from '@nestjs/swagger'
import { CreateUserDto } from './create-user.dto'

/**
 * PATCH semantics: omitted fields keep their current value. Password and
 * status are intentionally absent — they move via the dedicated
 * reset-password / disable / enable endpoints (spec §28).
 */
export class UpdateUserDto extends PartialType(CreateUserDto) {
  declare password?: never
}
