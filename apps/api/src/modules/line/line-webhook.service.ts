import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { validateSignature } from '@line/bot-sdk'
import { BeaconLog, Prisma } from '../../generated/prisma/client'
import { ApiError } from '../../common/http/api-error'
import { PrismaService } from '../../prisma/prisma.service'
import { BeaconEventService } from './beacon-event.service'

interface ParsedBeaconEvent {
  webhookEventId: string
  lineUserId: string
  hwid: string
  eventType: string
  eventTimestamp: Date
  raw: Record<string, unknown>
}

/**
 * LINE webhook pipeline (spec §10, §36; design doc §5.1):
 *
 *   verify signature -> persist raw beacon events (RECEIVED, idempotent by
 *   UNIQUE(webhook_event_id)) -> controller answers 200 -> async in-process
 *   processing (design decision D1: setImmediate fire-and-forget).
 *
 * Signature failures are rejected with 401 and leave NO beacon_logs row
 * (design §5.1). A database failure while persisting propagates (non-200) so
 * LINE redelivers — events must not be lost.
 */
@Injectable()
export class LineWebhookService {
  private readonly logger = new Logger(LineWebhookService.name)
  /** In-flight async processing tasks, so tests can await completion (drain). */
  private readonly inflight = new Set<Promise<void>>()

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly beaconEvents: BeaconEventService,
  ) {}

  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined): Promise<void> {
    // Signature FIRST, before any parsing (spec §30.1, design §5.1).
    const channelSecret = this.config.get<string | undefined>('LINE_CHANNEL_SECRET')
    if (!channelSecret) {
      // Optional-at-boot decision: the app runs without LINE config (dev), but
      // the webhook cannot verify anything — 503 tells LINE to retry later.
      throw new ApiError('LINE_NOT_CONFIGURED', 'ยังไม่ได้ตั้งค่า LINE_CHANNEL_SECRET', 503)
    }
    if (!rawBody || !signature || !validateSignature(rawBody, channelSecret, signature)) {
      this.logger.warn('LINE webhook rejected: missing or invalid x-line-signature (spec §49)')
      throw new ApiError('INVALID_LINE_SIGNATURE', 'ลายเซ็น LINE ไม่ถูกต้อง', 401)
    }

    let payload: unknown
    try {
      payload = JSON.parse(rawBody.toString('utf8'))
    } catch {
      throw new BadRequestException('Webhook body ไม่ใช่ JSON ที่ถูกต้อง')
    }
    const rawEvents =
      payload && typeof payload === 'object' && Array.isArray((payload as { events?: unknown }).events)
        ? ((payload as { events: unknown[] }).events)
        : []
    // "Webhook received" (spec §49) — logged for every signature-valid
    // delivery, including empty ones (which are acked immediately, §36).
    this.logger.log(`LINE webhook accepted: ${rawEvents.length} event(s)`)
    if (rawEvents.length === 0) return

    for (const rawEvent of rawEvents) {
      const event = parseBeaconEvent(rawEvent)
      if (!event) continue // non-beacon / malformed beacon events (spec §9, §37.1–3)

      try {
        const log = await this.prisma.beaconLog.create({
          data: {
            webhookEventId: event.webhookEventId,
            lineUserId: event.lineUserId,
            hwid: event.hwid,
            eventType: event.eventType,
            eventTimestamp: event.eventTimestamp,
            rawPayload: event.raw as Prisma.InputJsonValue,
            processingStatus: 'RECEIVED',
            // created_at defaults to now() = server receive time (spec §16)
          },
        })
        this.scheduleProcessing(log)
      } catch (error) {
        if (isUniqueViolation(error)) {
          // DUPLICATE semantics (spec §10/§55, design §5.1): this
          // webhookEventId was already persisted (concurrent request or LINE
          // redelivery). Skip the event entirely — never reprocess, and never
          // flip the existing row's status to DUPLICATE: §18 wants beacon_logs
          // to keep the authoritative outcome of the FIRST processing
          // (e.g. PROCESSED/UNKNOWN_USER); the duplicate delivery itself is
          // recorded in the application log instead.
          this.logger.log(`Duplicate webhook event ${event.webhookEventId} skipped (spec §10/§55)`)
          continue
        }
        throw error
      }
    }
  }

  /** Fire-and-forget processing after the 200 (design D1). Catches everything -> status ERROR (§37.13, §36). */
  private scheduleProcessing(log: BeaconLog): void {
    const task = (async (): Promise<void> => {
      try {
        await new Promise<void>((resolve) => setImmediate(resolve))
        await this.beaconEvents.process(log)
      } catch (error) {
        const stack = error instanceof Error ? error.stack : String(error)
        this.logger.error(`Beacon event processing failed (webhookEventId=${log.webhookEventId})`, stack)
        await this.prisma.beaconLog
          .update({ where: { id: log.id }, data: { processingStatus: 'ERROR' } })
          .catch(() => undefined)
      }
    })()
    this.inflight.add(task)
    void task.finally(() => this.inflight.delete(task))
  }

  /** Test hook: resolves once all scheduled processing has settled. */
  async drain(): Promise<void> {
    await Promise.allSettled([...this.inflight])
  }
}

/**
 * Accepts only beacon events (spec §9): every field the pipeline needs must be
 * present. Non-beacon webhook events (follow/message/...) are ignored — they
 * have no beacon_logs representation.
 */
function parseBeaconEvent(rawEvent: unknown): ParsedBeaconEvent | null {
  if (!rawEvent || typeof rawEvent !== 'object') return null
  const event = rawEvent as Record<string, unknown>
  if (event.type !== 'beacon') return null

  const beacon = event.beacon as { hwid?: unknown; type?: unknown } | undefined
  const source = event.source as { userId?: unknown } | undefined
  const webhookEventId = typeof event.webhookEventId === 'string' ? event.webhookEventId : undefined
  const lineUserId = typeof source?.userId === 'string' ? source.userId : undefined
  const hwid = typeof beacon?.hwid === 'string' ? beacon.hwid : undefined
  const eventType = typeof beacon?.type === 'string' ? beacon.type : undefined
  const timestamp = typeof event.timestamp === 'number' ? event.timestamp : undefined

  if (!webhookEventId || !lineUserId || !hwid || !eventType || timestamp === undefined) return null

  return {
    webhookEventId,
    lineUserId,
    hwid,
    eventType,
    eventTimestamp: new Date(timestamp), // event time — NOT server receive time (spec §16)
    raw: event,
  }
}

/** Prisma P2002 = unique constraint violation (UNIQUE(webhook_event_id)). */
function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  )
}
