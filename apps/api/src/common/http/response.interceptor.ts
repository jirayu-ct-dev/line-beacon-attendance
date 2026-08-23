import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from '@nestjs/common'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'

/**
 * Wraps every successful response in the envelope from spec §48:
 *
 *   { "success": true, "data": <controller return value> }
 *
 * `undefined` payloads become `null` so the envelope is always well-formed JSON.
 * Endpoints that return lists can later nest pagination inside `data`
 * (e.g. { items, total, page, pageSize }) — the envelope itself stays stable.
 * Binary downloads (StreamableFile) pass through untouched — Nest streams them.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, Envelope<T> | StreamableFile> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<Envelope<T> | StreamableFile> {
    return next.handle().pipe(
      map((data) => (data instanceof StreamableFile ? data : { success: true, data: data === undefined ? null : data })),
    )
  }
}

export interface Envelope<T> {
  success: true
  data: T | null
}
