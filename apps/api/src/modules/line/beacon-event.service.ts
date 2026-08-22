import { Injectable, Logger } from '@nestjs/common'
import { BeaconLog } from '../../generated/prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { LINE_MESSAGES } from './line-messages'
import { LineNotificationService } from './line-notification.service'

/**
 * Beacon event business logic (spec §37). Phase 4a implements the steps that
 * do not need the activities module; Phase 7 completes steps 7–10 (activity
 * matching per spec §38, time window, attendance creation) inside
 * matchActivity()/processEnter().
 *
 * This service resolves every event to a terminal processing status and
 * updates the beacon_logs row (§18). Unexpected errors are NOT caught here —
 * LineWebhookService wraps processing and marks the row ERROR (§37.13).
 */
@Injectable()
export class BeaconEventService {
  private readonly logger = new Logger(BeaconEventService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: LineNotificationService,
  ) {}

  async process(log: BeaconLog): Promise<void> {
    if (log.eventType !== 'enter') {
      // banner/stay are ignored for check-in (spec §9) but still logged for
      // audit (§18); closed as PROCESSED = "handled, nothing to do".
      await this.prisma.beaconLog.update({
        where: { id: log.id },
        data: { processingStatus: 'PROCESSED' },
      })
      this.logger.log(`Beacon event ${log.webhookEventId} (${log.eventType}) ignored for check-in`)
      return
    }
    await this.processEnter(log)
  }

  private async processEnter(log: BeaconLog): Promise<void> {
    // §37.4 — identify the student via line_accounts (line_user_id is unique)
    const lineAccount = await this.prisma.lineAccount.findUnique({
      where: { lineUserId: log.lineUserId },
      include: { student: true },
    })
    if (!lineAccount) {
      // Spec §39: UNKNOWN_USER, no attendance, invite to register ("อาจส่ง").
      // The reply outcome cannot get a notifications row (student_id NOT NULL).
      const result = await this.notifications.send({
        studentId: null,
        lineUserId: log.lineUserId,
        type: 'UNKNOWN_USER',
        message: LINE_MESSAGES.UNKNOWN_USER,
        replyToken: replyTokenOf(log),
        excludeLogId: log.id,
      })
      await this.prisma.beaconLog.update({
        where: { id: log.id },
        data: { processingStatus: 'UNKNOWN_USER' },
      })
      this.logger.log(
        `Beacon event ${log.webhookEventId}: UNKNOWN_USER (notification: ${result})`,
      )
      return
    }

    // §37.5 — identify the beacon by hwid
    const beacon = await this.prisma.beacon.findUnique({ where: { hwid: log.hwid } })
    if (!beacon) {
      // Spec §40: log UNKNOWN_BEACON, never auto-create, admins see it in logs.
      await this.prisma.beaconLog.update({
        where: { id: log.id },
        data: { processingStatus: 'UNKNOWN_BEACON', studentId: lineAccount.studentId },
      })
      this.logger.warn(`Unknown beacon hwid=${log.hwid} (spec §40) — event ${log.webhookEventId}`)
      return
    }

    // §37.7 — find an eligible activity. Phase 7 implements spec §38 matching.
    const activity = await this.matchActivity(log, beacon.id)
    if (!activity) {
      // Spec §41: NO_ACTIVE_ACTIVITY + cooldown notification so a repeatedly
      // broadcasting beacon does not spam the student (§42).
      await this.prisma.beaconLog.update({
        where: { id: log.id },
        data: {
          processingStatus: 'NO_ACTIVE_ACTIVITY',
          studentId: lineAccount.studentId,
          beaconId: beacon.id,
        },
      })
      const result = await this.notifications.send({
        studentId: lineAccount.studentId,
        lineUserId: log.lineUserId,
        type: 'NO_ACTIVE_ACTIVITY',
        message: LINE_MESSAGES.NO_ACTIVE_ACTIVITY,
        replyToken: replyTokenOf(log),
      })
      this.logger.log(
        `Beacon event ${log.webhookEventId}: NO_ACTIVE_ACTIVITY (notification: ${result})`,
      )
      return
    }

    // TODO(Phase 7 — attendance engine, spec §37.8–10 / §16): validate the
    // check-in window using log.eventTimestamp (THE authoritative check-in
    // time — never server receive time), check for an existing attendance,
    // then create it under UNIQUE(activity_id, student_id) (§17) and send the
    // §20 success/late notification.
  }

  /**
   * Activity matching per spec §38: status=PUBLISHED, beacon matches hwid, and
   * event_timestamp within [checkin_open_at, checkin_close_at] (event
   * timestamp, not server time). Overlapping matches must log an error and
   * create nothing (§38).
   *
   * Stub for Phase 4a — the activities module does not exist yet, so every
   * enter event resolves to NO_ACTIVE_ACTIVITY. The method is the extension
   * point Phase 7 fills in (inputs intentionally unused until then).
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Phase 7 stub inputs (spec §38)
  private async matchActivity(_log: BeaconLog, _beaconId: string): Promise<null> {
    return null
  }
}

/** The single-use replyToken lives in the raw event payload (spec §9). */
function replyTokenOf(log: BeaconLog): string | undefined {
  const payload = log.rawPayload as { replyToken?: unknown } | null
  return typeof payload?.replyToken === 'string' ? payload.replyToken : undefined
}
