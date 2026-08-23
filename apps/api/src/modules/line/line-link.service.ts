import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Activity, ActivityStatus, Prisma } from '../../generated/prisma/client'
import { ApiError } from '../../common/http/api-error'
import { Paginated, PaginationDto, resolvePagination } from '../../common/dto/pagination.dto'
import { AuditService } from '../audit/audit.service'
import { PrismaService } from '../../prisma/prisma.service'
import { timeStateOf } from '../activities/activity-time-state'
import { calendarDay, parseDdMmYyyy } from './line-validation'
import { LinkLineDto } from './dto/link-line.dto'
import {
  AttendanceItemDto,
  MeResponseDto,
  MyActivityItemDto,
  StudentProfileDto,
} from './dto/me-response.dto'

/**
 * Rate limit for account-linking guesses (spec §7.1): at most 5 FAILED attempts
 * per student code per hour. In-memory sliding window — acceptable for the
 * single-instance deployment (design decision D1: no Redis); a restart clears
 * the window, and the @Throttle HTTP limit adds a per-IP backstop.
 */
const MAX_FAILED_ATTEMPTS = 5
const FAILURE_WINDOW_MS = 60 * 60 * 1000

/**
 * One generic message for every verification failure (unknown code, wrong
 * birth date, inactive student) — deliberately NOT revealing which part was
 * wrong, mirroring the login endpoint's no-enumeration behaviour.
 */
const VERIFICATION_FAILED_MESSAGE =
  'ไม่พบข้อมูลนักศึกษาหรือข้อมูลไม่ถูกต้อง กรุณาตรวจสอบรหัสนักศึกษาและวันเดือนปีเกิด (DDMMYYYY ปี ค.ศ.) อีกครั้ง'

/**
 * LIFF account linking (spec §7.1) + the student's own data endpoints
 * (spec §35: GET /me, GET /me/attendances).
 *
 * §7.1 conflict rules: a student links exactly one LINE account and a LINE
 * account links exactly one student; re-linking after a mismatch requires an
 * admin unlink (self-service re-link is NOT allowed — only Admin can
 * unlink/reset), so both conflict directions answer 409.
 */
@Injectable()
export class LineLinkService {
  private readonly logger = new Logger(LineLinkService.name)
  /** studentCode -> timestamps (ms) of failed attempts inside the window. */
  private readonly failedAttempts = new Map<string, number[]>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Links the verified LINE user to a student after checking student code +
   * birth date (DDMMYYYY ค.ศ.). Returns the /me payload for the now-linked
   * account.
   */
  async link(
    lineUserId: string,
    profile: { name?: string; picture?: string },
    dto: LinkLineDto,
  ): Promise<MeResponseDto> {
    if (this.failureCount(dto.studentCode) >= MAX_FAILED_ATTEMPTS) {
      throw new ApiError(
        'RATE_LIMITED',
        'กรอกข้อมูลไม่ถูกต้องเกิน 5 ครั้งในชั่วโมงนี้ กรุณารอสักครู่แล้วลองใหม่อีกครั้ง หรือติดต่อผู้ดูแลระบบ',
        429,
      )
    }

    const birthDate = parseDdMmYyyy(dto.birthDate)
    const student = await this.prisma.student.findUnique({
      where: { studentCode: dto.studentCode },
      include: { lineAccount: true },
    })

    // Same generic outcome for unknown code / wrong birth date / inactive
    // student (no enumeration); every miss counts toward the rate limit.
    if (!student || student.status !== 'ACTIVE' || !birthDate || calendarDay(student.birthDate) !== calendarDay(birthDate)) {
      this.recordFailure(dto.studentCode)
      this.logger.warn(`LINE link verification failed (studentCode=${dto.studentCode})`)
      throw new ApiError('LINK_VERIFICATION_FAILED', VERIFICATION_FAILED_MESSAGE, 404)
    }

    // Same LINE user re-submitting their own code: idempotent success, just
    // refresh the profile fields from the token.
    if (student.lineAccount) {
      if (student.lineAccount.lineUserId === lineUserId) {
        await this.prisma.lineAccount.update({
          where: { id: student.lineAccount.id },
          data: { displayName: profile.name, pictureUrl: profile.picture },
        })
        this.clearFailures(dto.studentCode)
        return this.getMe(lineUserId)
      }
      // Student already linked to ANOTHER LINE account — admin must unlink first (§7.1).
      throw new ApiError(
        'STUDENT_ALREADY_LINKED',
        'รหัสนักศึกษานี้เชื่อมต่อกับบัญชี LINE อื่นอยู่ หากคุณคิดว่านี่คือรหัสของคุณ กรุณาติดต่อผู้ดูแลระบบ',
        409,
      )
    }

    const existingAccount = await this.prisma.lineAccount.findUnique({ where: { lineUserId } })
    if (existingAccount) {
      // This LINE account already linked to ANOTHER student — admin must unlink first (§7.1).
      throw new ApiError(
        'LINE_ALREADY_LINKED',
        'บัญชี LINE นี้เชื่อมต่อกับรหัสนักศึกษาอื่นอยู่ หากต้องการเปลี่ยนมาใช้รหัสนี้ กรุณาติดต่อผู้ดูแลระบบ',
        409,
      )
    }

    const account = await this.createAccount(student.id, lineUserId, profile)
    await this.audit.log({
      userId: null, // student self-service action — no dashboard user actor
      action: 'LINE_ACCOUNT_LINKED',
      entityType: 'LINE_ACCOUNT',
      entityId: account.id,
      newValue: {
        student_id: student.id,
        student_code: student.studentCode,
        line_user_id: lineUserId,
        display_name: profile.name ?? null,
        picture_url: profile.picture ?? null,
      },
    })

    this.clearFailures(dto.studentCode)
    this.logger.log(`LINE account linked (studentCode=${student.studentCode})`)
    return this.getMe(lineUserId)
  }

  /** Removes the caller's own line_accounts row (idempotent — no row, no error). */
  async unlink(lineUserId: string): Promise<null> {
    const account = await this.prisma.lineAccount.findUnique({ where: { lineUserId } })
    if (!account) return null

    await this.prisma.lineAccount.delete({ where: { id: account.id } })
    await this.audit.log({
      userId: null, // student self-service action — no dashboard user actor
      action: 'LINE_ACCOUNT_UNLINKED',
      entityType: 'LINE_ACCOUNT',
      entityId: account.id,
      oldValue: {
        student_id: account.studentId,
        line_user_id: account.lineUserId,
        display_name: account.displayName,
        picture_url: account.pictureUrl,
      },
    })
    this.logger.log(`LINE account unlinked by its owner (lineUserId=${lineUserId})`)
    return null
  }

  /** GET /me: student profile + link status. Always 200 — `linked` tells the client which LIFF page applies. */
  async getMe(lineUserId: string): Promise<MeResponseDto> {
    const account = await this.prisma.lineAccount.findUnique({
      where: { lineUserId },
      include: { student: true },
    })
    if (!account) return { linked: false, student: null, line: null }

    return {
      linked: true,
      student: toStudentProfile(account.student),
      line: {
        lineUserId: account.lineUserId,
        displayName: account.displayName,
        pictureUrl: account.pictureUrl,
        linkedAt: account.linkedAt.toISOString(),
      },
    }
  }

  /** GET /me/attendances: own history, newest first. Unlinked callers simply have none. */
  async getMyAttendances(lineUserId: string, query: PaginationDto): Promise<Paginated<AttendanceItemDto>> {
    const { page, pageSize, order } = resolvePagination(query)
    const account = await this.prisma.lineAccount.findUnique({
      where: { lineUserId },
      select: { studentId: true },
    })
    if (!account) return { items: [], total: 0, page, pageSize }

    const where = { studentId: account.studentId }
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.attendance.findMany({
        where,
        include: { activity: { select: { name: true } } },
        orderBy: [{ checkInAt: order }],
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
      this.prisma.attendance.count({ where }),
    ])

    return {
      items: rows.map((row) => ({
        id: row.id,
        activityId: row.activityId,
        activityName: row.activity.name,
        checkInAt: row.checkInAt.toISOString(),
        status: row.status,
        checkinMethod: row.checkinMethod,
      })),
      total,
      page,
      pageSize,
    }
  }

  /**
   * GET /me/activities: PUBLISHED activities only (spec §35 reserved this
   * endpoint for the LIFF activities page). Unlinked callers still get the
   * list — published activity info is not personal, `myAttendance` is null.
   */
  async getMyActivities(lineUserId: string, query: PaginationDto): Promise<Paginated<MyActivityItemDto>> {
    const { page, pageSize, order } = resolvePagination(query)
    const where = { status: ActivityStatus.PUBLISHED }
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.activity.findMany({
        where,
        orderBy: [{ startAt: order }],
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
      this.prisma.activity.count({ where }),
    ])
    return { items: await this.withMyAttendance(rows, lineUserId), total, page, pageSize }
  }

  /** GET /me/activities/:id — drafts/cancelled are invisible to students (404). */
  async getMyActivity(lineUserId: string, id: string): Promise<MyActivityItemDto> {
    const activity = await this.prisma.activity.findFirst({ where: { id, status: ActivityStatus.PUBLISHED } })
    if (!activity) throw new NotFoundException('ไม่พบกิจกรรม')
    const [item] = await this.withMyAttendance([activity], lineUserId)
    return item
  }

  /** Maps activities to the student DTO, attaching the caller's own attendance per activity. */
  private async withMyAttendance(activities: Activity[], lineUserId: string): Promise<MyActivityItemDto[]> {
    if (activities.length === 0) return []
    const account = await this.prisma.lineAccount.findUnique({
      where: { lineUserId },
      select: { studentId: true },
    })
    const mine = account
      ? await this.prisma.attendance.findMany({
          where: { studentId: account.studentId, activityId: { in: activities.map((a) => a.id) } },
          select: { activityId: true, checkInAt: true, status: true, checkinMethod: true },
        })
      : []
    const mineByActivity = new Map(mine.map((row) => [row.activityId, row]))

    return activities.map((activity) => {
      const mine = mineByActivity.get(activity.id)
      return {
        id: activity.id,
        name: activity.name,
        description: activity.description,
        location: activity.location,
        startAt: activity.startAt.toISOString(),
        endAt: activity.endAt.toISOString(),
        checkinOpenAt: activity.checkinOpenAt.toISOString(),
        lateAt: activity.lateAt.toISOString(),
        checkinCloseAt: activity.checkinCloseAt.toISOString(),
        timeState: timeStateOf(activity),
        myAttendance: mine
          ? {
              checkInAt: mine.checkInAt.toISOString(),
              status: mine.status,
              checkinMethod: mine.checkinMethod,
            }
          : null,
      }
    })
  }

  /** Race-safe create: a concurrent link could win one of the UNIQUE constraints first. */
  private async createAccount(
    studentId: string,
    lineUserId: string,
    profile: { name?: string; picture?: string },
  ): Promise<{ id: string }> {
    try {
      return await this.prisma.lineAccount.create({
        data: {
          studentId,
          lineUserId,
          displayName: profile.name,
          pictureUrl: profile.picture,
        },
        select: { id: true },
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ApiError(
          'LINE_LINK_CONFLICT',
          'การเชื่อมต่อนี้ถูกดำเนินการไปแล้ว กรุณาลองใหม่อีกครั้ง',
          409,
        )
      }
      throw error
    }
  }

  private failureCount(studentCode: string): number {
    const cutoff = Date.now() - FAILURE_WINDOW_MS
    const attempts = (this.failedAttempts.get(studentCode) ?? []).filter((ts) => ts > cutoff)
    this.failedAttempts.set(studentCode, attempts)
    return attempts.length
  }

  private recordFailure(studentCode: string): void {
    const attempts = this.failedAttempts.get(studentCode) ?? []
    attempts.push(Date.now())
    this.failedAttempts.set(studentCode, attempts)
  }

  private clearFailures(studentCode: string): void {
    this.failedAttempts.delete(studentCode)
  }
}

function toStudentProfile(student: {
  id: string
  studentCode: string
  firstName: string
  lastName: string
  birthDate: Date
  year: number
  email: string | null
  status: StudentProfileDto['status']
}): StudentProfileDto {
  return {
    id: student.id,
    studentCode: student.studentCode,
    firstName: student.firstName,
    lastName: student.lastName,
    birthDate: calendarDay(student.birthDate),
    year: student.year,
    email: student.email,
    status: student.status,
  }
}
