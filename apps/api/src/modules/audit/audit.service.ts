import { Injectable } from '@nestjs/common'
import { Prisma } from '../../generated/prisma/client'
import { PrismaService } from '../../prisma/prisma.service'

/**
 * Audit action names (spec §56) — stable contract for the audit-log viewer.
 * STUDENT_DISABLED / STUDENT_ENABLED are additions following the §56
 * `<ENTITY>_<VERB>` naming pattern: spec §35 requires disable/enable to be
 * audited but §56 does not name those actions explicitly.
 */
export const AUDIT_ACTIONS = [
  'LOGIN',
  'STUDENT_CREATED',
  'STUDENT_UPDATED',
  'STUDENT_DISABLED',
  'STUDENT_ENABLED',
  'STUDENT_IMPORTED',
  'LINE_ACCOUNT_LINKED',
  'LINE_ACCOUNT_UNLINKED',
  'BEACON_CREATED',
  'BEACON_UPDATED',
  'ACTIVITY_CREATED',
  'ACTIVITY_UPDATED',
  'ACTIVITY_PUBLISHED',
  'ACTIVITY_CANCELLED',
  'ATTENDANCE_MANUAL_CREATED',
  'ATTENDANCE_UPDATED',
] as const

export type AuditAction = (typeof AUDIT_ACTIONS)[number]

export interface AuditEntry {
  userId: string
  action: AuditAction
  entityType: string
  entityId: string
  /** Snapshot before the change (plain JSON — full old/new values per spec §56). */
  oldValue?: Record<string, unknown>
  /** Snapshot after the change. */
  newValue?: Record<string, unknown>
}

/**
 * Writes audit_logs rows. Called from service layers (design doc §5.3 —
 * deliberately NOT a global interceptor, so each caller controls the §56
 * action name and the old/new snapshots).
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        oldValue: entry.oldValue as Prisma.InputJsonValue | undefined,
        newValue: entry.newValue as Prisma.InputJsonValue | undefined,
      },
    })
  }
}
