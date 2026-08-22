import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { messagingApi } from '@line/bot-sdk'
import { PrismaService } from '../../prisma/prisma.service'

/** DI token for the Messaging API client — tests override this with a mock. */
export const LINE_MESSAGING_CLIENT = 'LINE_MESSAGING_CLIENT'

export type NotificationSendResult = 'SENT' | 'FAILED' | 'SKIPPED_COOLDOWN' | 'SKIPPED_NO_CLIENT'

export interface LineNotificationParams {
  /**
   * notifications.student_id is NOT NULL (spec §33). For UNKNOWN_USER there is
   * no student yet, so no notifications row can be recorded — the send outcome
   * goes to logs only (spec §49). See send() for the channel implications.
   */
  studentId: string | null
  lineUserId: string
  type: string
  message: string
  /** Prefer reply (free, valid ~1 min, single-use — spec §20); push is the fallback. */
  replyToken?: string
  activityId?: string
  /**
   * The beacon_logs row currently being processed. Excluded from the
   * unknown-user cooldown lookup, which otherwise matches the row itself.
   */
  excludeLogId?: string
}

/**
 * Sends user-facing LINE messages (spec §20): reply token first, push fallback.
 * Every send attempt for a KNOWN student is recorded in `notifications`
 * (PENDING -> SENT/FAILED). Never throws — a notification failure must not
 * affect the processing result (spec §10, §55).
 */
@Injectable()
export class LineNotificationService {
  private readonly logger = new Logger(LineNotificationService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(LINE_MESSAGING_CLIENT) private readonly client: messagingApi.MessagingApiClient | null,
  ) {}

  async send(params: LineNotificationParams): Promise<NotificationSendResult> {
    // Cooldown first (spec §42): repeated statuses must not spam the student.
    if (await this.recentlySent(params)) {
      this.logger.log(`Notification suppressed by cooldown (type=${params.type}, user=${params.lineUserId})`)
      return 'SKIPPED_COOLDOWN'
    }

    if (!this.client) {
      // LINE_CHANNEL_ACCESS_TOKEN not configured (e.g. local dev without a real
      // Official Account). No row is written because nothing was attempted.
      this.logger.warn('LINE messaging client not configured — notification skipped (LINE_CHANNEL_ACCESS_TOKEN missing)')
      return 'SKIPPED_NO_CLIENT'
    }

    const messages: messagingApi.TextMessage[] = [{ type: 'text', text: params.message }]

    if (params.studentId === null) {
      return this.sendToUnknownUser(params, messages)
    }
    return this.sendToStudent(params, messages)
  }

  /** Unknown LINE user (spec §39): reply-only, no notifications row possible, outcome logged. */
  private async sendToUnknownUser(
    params: LineNotificationParams,
    messages: messagingApi.TextMessage[],
  ): Promise<NotificationSendResult> {
    if (!this.client || !params.replyToken) {
      this.logger.warn(`Cannot notify unlinked user ${params.lineUserId}: no reply token available`)
      return 'FAILED'
    }
    try {
      await this.client.replyMessage({ replyToken: params.replyToken, messages })
      this.logger.log(`Replied register hint to unlinked user ${params.lineUserId}`)
      return 'SENT'
    } catch (error) {
      // No push fallback here: pushing to an unregistered user burns quota and
      // the outcome could not be recorded (student_id NOT NULL, spec §33).
      this.logger.warn(`Reply to unlinked user ${params.lineUserId} failed: ${describe(error)}`)
      return 'FAILED'
    }
  }

  /** Known student: record PENDING -> try reply -> push fallback -> SENT/FAILED (spec §20). */
  private async sendToStudent(
    params: LineNotificationParams,
    messages: messagingApi.TextMessage[],
  ): Promise<NotificationSendResult> {
    const notification = await this.prisma.notification.create({
      data: {
        studentId: params.studentId!,
        type: params.type,
        message: params.message,
        activityId: params.activityId,
        status: 'PENDING',
      },
    })

    try {
      if (params.replyToken && this.client) {
        try {
          await this.client.replyMessage({ replyToken: params.replyToken, messages })
        } catch (replyError) {
          // Reply token expired or already used (~1 min validity, single-use —
          // spec §20): fall back to push, which consumes the message quota.
          this.logger.warn(
            `Reply failed (type=${params.type}), falling back to push: ${describe(replyError)}`,
          )
          await this.client.pushMessage({ to: params.lineUserId, messages })
        }
      } else if (this.client) {
        await this.client.pushMessage({ to: params.lineUserId, messages })
      }

      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { status: 'SENT', sentAt: new Date() },
      })
      return 'SENT'
    } catch (error) {
      const errorMessage = describe(error)
      this.logger.warn(`Notification ${notification.id} failed: ${errorMessage}`)
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { status: 'FAILED', errorMessage: errorMessage.slice(0, 500) },
      })
      return 'FAILED'
    }
  }

  /**
   * Cooldown check (spec §42, design doc §5.1 — no Redis).
   * Known students: last SENT notification row per student+type.
   * Unknown users: the newest UNKNOWN_USER beacon log for the LINE user
   * (event-based; no notifications row exists for them — documented tradeoff).
   */
  private async recentlySent(params: LineNotificationParams): Promise<boolean> {
    const cutoff = new Date(Date.now() - this.cooldownMinutes() * 60_000)

    if (params.studentId) {
      const recent = await this.prisma.notification.findFirst({
        where: {
          studentId: params.studentId,
          type: params.type,
          status: 'SENT',
          sentAt: { gte: cutoff },
        },
        select: { id: true },
      })
      return recent !== null
    }

    const recent = await this.prisma.beaconLog.findFirst({
      where: {
        lineUserId: params.lineUserId,
        processingStatus: 'UNKNOWN_USER',
        createdAt: { gte: cutoff },
        ...(params.excludeLogId ? { id: { not: params.excludeLogId } } : {}),
      },
      select: { id: true },
    })
    return recent !== null
  }

  private cooldownMinutes(): number {
    const raw = Number(this.config.get<string | undefined>('NOTIFICATION_COOLDOWN_MINUTES'))
    return Number.isFinite(raw) && raw > 0 ? raw : 10
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  return String(error)
}
