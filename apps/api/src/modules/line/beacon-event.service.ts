import { Injectable, Logger } from '@nestjs/common'
import { Activity, BeaconLog, Prisma } from '../../generated/prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { checkinSuccessMessage, alreadyCheckedInMessage, LINE_MESSAGES, NOTIFICATION_TYPES } from './line-messages'
import { LineNotificationService } from './line-notification.service'

/**
 * Beacon event business logic (spec §10, §15–§17, §37, §38). Completes the
 * check-in pipeline for `enter` events: activity matching, time window,
 * duplicate protection, attendance creation and the §20 notification.
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

    // §37.7 — eligible activities (spec §38): PUBLISHED and linked to this
    // beacon. An INACTIVE/MAINTENANCE beacon cannot serve check-ins (§31) and
    // lands in NO_ACTIVE_ACTIVITY — the closest status the §18 enum offers.
    const candidates =
      beacon.status === 'ACTIVE' ? await this.findCandidateActivities(beacon.id) : []
    if (candidates.length === 0) {
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

    // §37.8 — time window from THE event timestamp (§16), never server time.
    const ts = log.eventTimestamp
    const inWindow = candidates.filter(
      (activity) => ts >= activity.checkinOpenAt && ts <= activity.checkinCloseAt,
    )
    if (inWindow.length === 0) {
      // Too early or past close (§16, §55) — cooldown notification like
      // NO_ACTIVE_ACTIVITY so repeats do not spam (§42).
      await this.prisma.beaconLog.update({
        where: { id: log.id },
        data: {
          processingStatus: 'OUTSIDE_CHECKIN_WINDOW',
          studentId: lineAccount.studentId,
          beaconId: beacon.id,
        },
      })
      const result = await this.notifications.send({
        studentId: lineAccount.studentId,
        lineUserId: log.lineUserId,
        type: 'OUTSIDE_CHECKIN_WINDOW',
        message: LINE_MESSAGES.OUTSIDE_CHECKIN_WINDOW,
        replyToken: replyTokenOf(log),
      })
      this.logger.log(
        `Beacon event ${log.webhookEventId}: OUTSIDE_CHECKIN_WINDOW (notification: ${result})`,
      )
      return
    }

    // §38 — overlapping published windows on one beacon should have been
    // rejected at publish/link; if it still happens, refuse deterministically
    // (never pick randomly) and create no attendance.
    if (inWindow.length > 1) {
      this.logger.error(
        `Ambiguous activity match for beacon hwid=${beacon.hwid} at ${ts.toISOString()}: ` +
          `${inWindow.map((a) => `${a.name} (${a.id})`).join(', ')} — no attendance created (spec §38)`,
      )
      await this.prisma.beaconLog.update({
        where: { id: log.id },
        data: {
          processingStatus: 'ERROR',
          studentId: lineAccount.studentId,
          beaconId: beacon.id,
        },
      })
      return
    }
    const activity = inWindow[0]

    // §37.9 — duplicate guard (§17). Existing attendance means a later enter
    // burst of the same student — record DUPLICATE, never re-send the success
    // message (§42); the ALREADY_CHECKED_IN info message below is a different
    // message with its own cooldown bucket.
    const existing = await this.prisma.attendance.findUnique({
      where: { activityId_studentId: { activityId: activity.id, studentId: lineAccount.studentId } },
      select: { id: true, checkInAt: true },
    })
    let created = false
    if (!existing) {
      // §37.10 + §16 — create with the event timestamp as check_in_at and the
      // PRESENT/LATE boundary (late_at inclusive on the PRESENT side).
      // UNIQUE(activity_id, student_id) is the backstop for the create/check
      // race (§17); a loss lands in DUPLICATE, not an error.
      const status = ts <= activity.lateAt ? 'PRESENT' : 'LATE'
      try {
        const attendance = await this.prisma.attendance.create({
          data: {
            activityId: activity.id,
            studentId: lineAccount.studentId,
            checkInAt: ts,
            status,
            checkinMethod: 'BEACON',
            beaconId: beacon.id,
          },
        })
        created = true
        // §20 success notification — reply token first. A failure must not
        // affect the attendance or the processing result (§10, §55).
        const result = await this.notifications.send({
          studentId: lineAccount.studentId,
          lineUserId: log.lineUserId,
          type: status,
          message: checkinSuccessMessage(activity.name, ts, status),
          replyToken: replyTokenOf(log),
          activityId: activity.id,
        })
        this.logger.log(
          `Attendance ${attendance.id} created (${status}) for event ${log.webhookEventId} (notification: ${result})`,
        )
      } catch (error) {
        if (isUniqueViolation(error)) {
          this.logger.log(
            `Attendance race lost for event ${log.webhookEventId} — treating as duplicate (spec §17)`,
          )
          await this.notifyAlreadyCheckedIn(log, lineAccount.studentId, activity)
        } else {
          throw error
        }
      }
    } else {
      this.logger.log(
        `Beacon event ${log.webhookEventId}: DUPLICATE (attendance already exists, spec §17)`,
      )
      await this.notifyAlreadyCheckedIn(log, lineAccount.studentId, activity, existing.checkInAt)
    }

    await this.prisma.beaconLog.update({
      where: { id: log.id },
      data: {
        processingStatus: created ? 'PROCESSED' : 'DUPLICATE',
        studentId: lineAccount.studentId,
        beaconId: beacon.id,
      },
    })
  }

  /** §38 candidates: PUBLISHED activities linked to the beacon (any window — the window is checked next to distinguish NO_ACTIVE_ACTIVITY from OUTSIDE_CHECKIN_WINDOW). */
  private async findCandidateActivities(beaconId: string): Promise<Activity[]> {
    return this.prisma.activity.findMany({
      where: { status: 'PUBLISHED', beacons: { some: { beaconId } } },
      orderBy: { checkinOpenAt: 'asc' },
    })
  }

  /**
   * Plain-text informational message for a duplicate enter event (§17/§55
   * forbid a second attendance, not a reply). Reply token first, own cooldown
   * bucket per student+activity (§42) — never the success message again.
   */
  private async notifyAlreadyCheckedIn(
    log: BeaconLog,
    studentId: string,
    activity: Activity,
    checkInAt?: Date,
  ): Promise<void> {
    const result = await this.notifications.send({
      studentId,
      lineUserId: log.lineUserId,
      type: NOTIFICATION_TYPES.ALREADY_CHECKED_IN,
      message: alreadyCheckedInMessage(activity.name, checkInAt),
      replyToken: replyTokenOf(log),
      activityId: activity.id,
    })
    this.logger.log(`Beacon event ${log.webhookEventId}: ALREADY_CHECKED_IN notification: ${result}`)
  }
}

/** Prisma P2002 = unique constraint violation (here: UNIQUE(activity_id, student_id), §17). */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

/** The single-use replyToken lives in the raw event payload (spec §9). */
function replyTokenOf(log: BeaconLog): string | undefined {
  const payload = log.rawPayload as { replyToken?: unknown } | null
  return typeof payload?.replyToken === 'string' ? payload.replyToken : undefined
}
