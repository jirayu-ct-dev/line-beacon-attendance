import { HttpException } from '@nestjs/common'

/**
 * Typed error for the response envelope (spec §48).
 * Services throw it when they need a domain-specific error code, e.g.
 *
 *   throw new ApiError('ACTIVITY_NOT_FOUND', 'Activity not found', 404)
 *
 * which the GlobalExceptionFilter renders as
 *   { "success": false, "error": { "code": "ACTIVITY_NOT_FOUND", "message": "Activity not found" } }
 */
export class ApiError extends HttpException {
  readonly code: string

  constructor(code: string, message: string, status: number) {
    super({ code, message }, status)
    this.code = code
  }
}
