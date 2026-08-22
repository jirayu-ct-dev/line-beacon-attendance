import { PartialType } from '@nestjs/swagger'
import { CreateActivityDto } from './create-activity.dto'

/**
 * PATCH semantics: every field optional; omitted fields keep their current
 * value. `status` is intentionally absent — it only moves via the dedicated
 * publish/cancel endpoints (spec §35).
 */
export class UpdateActivityDto extends PartialType(CreateActivityDto) {}
