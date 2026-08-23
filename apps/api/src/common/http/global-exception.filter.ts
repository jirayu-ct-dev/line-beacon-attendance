import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common'
import { Response } from 'express'
import { Prisma } from '../../generated/prisma/client'

/**
 * Catch-all exception filter rendering every error as the envelope from spec §48:
 *
 *   { "success": false, "error": { "code": string, "message": string } }
 *
 * Error-code convention (stable contract for the web client):
 *   - VALIDATION_ERROR (400) — class-validator / malformed input (Thai-friendly message)
 *   - UNAUTHORIZED     (401) — missing/invalid credentials or token
 *   - FORBIDDEN        (403) — authenticated but wrong role / no ownership
 *   - NOT_FOUND        (404) — resource does not exist
 *   - CONFLICT         (409) — unique constraint / state conflict
 *   - RATE_LIMITED     (429) — throttled (too many requests)
 *   - INTERNAL         (500) — unexpected failure
 * Domain codes (e.g. ACTIVITY_NOT_FOUND) pass through unchanged when thrown as ApiError.
 *
 * Non-HttpException errors never leak internals: the client gets a generic Thai
 * message and HTTP 500; the real error (with stack) goes to logs only.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>()

    const status: number =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR

    // Spec §49 "Unauthorized Access": 401/403 rejections (guards, login
    // failures) are security events — logged centrally here with method+url,
    // never with credentials.
    if (status === HttpStatus.UNAUTHORIZED || status === HttpStatus.FORBIDDEN) {
      const req = host.switchToHttp().getRequest<{ method?: string; url?: string }>()
      this.logger.warn(`Unauthorized access (spec §49): ${req.method ?? '?'} ${req.url ?? '?'} → ${status}`)
    }

    const isDbError =
      exception instanceof Prisma.PrismaClientKnownRequestError ||
      exception instanceof Prisma.PrismaClientUnknownRequestError
    if (isDbError) {
      // Spec §49 "Database Error": unconverted Prisma failures get a distinct
      // marker so they are searchable next to the generic 5xx stacks. The
      // Prisma message/stack stays in logs only (constraint names, no values).
      const code = exception instanceof Prisma.PrismaClientKnownRequestError ? exception.code : 'UNKNOWN'
      this.logger.error(`Database error (spec §49): ${code} ${exception.message}`, exception.stack)
    } else if (status >= 500) {
      // Log the full error for 5xx (spec §49 categories: unhandled errors)
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
        'Unhandled server error',
      )
    }

    const { code, message } = this.toErrorCodeAndMessage(exception, status)
    response.status(status).json({ success: false, error: { code, message } })
  }

  private toErrorCodeAndMessage(exception: unknown, status: number): { code: string; message: string } {
    if (!(exception instanceof HttpException)) {
      return { code: 'INTERNAL', message: 'เกิดข้อผิดพลาดภายในระบบ โปรดลองใหม่อีกครั้ง' }
    }

    const body = exception.getResponse()
    const code = typeof body === 'object' && body !== null && 'code' in body ? String((body as { code: unknown }).code) : codeForStatus(status)

    let message: string
    if (typeof body === 'string') {
      message = body
    } else {
      const raw = (body as { message?: unknown }).message
      // class-validator produces an array of messages — join into one Thai-friendly line
      message = Array.isArray(raw) ? raw.join('; ') : raw !== undefined ? String(raw) : exception.message
    }
    return { code, message }
  }
}

const CODE_BY_STATUS: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
}

function codeForStatus(status: number): string {
  return CODE_BY_STATUS[status] ?? 'INTERNAL'
}
