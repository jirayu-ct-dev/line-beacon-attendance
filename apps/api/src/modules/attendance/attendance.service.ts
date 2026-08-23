import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '../../generated/prisma/client'
import { Paginated, resolvePagination } from '../../common/dto/pagination.dto'
import { AuthUser } from '../../common/auth/current-user.decorator'
import { PrismaService } from '../../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { ListAttendanceDto, sortToPrismaField } from './dto/list-attendance.dto'
import { ManualCheckinDto } from './dto/manual-checkin.dto'
import { UpdateAttendanceDto } from './dto/update-attendance.dto'
import {
  AttendanceRowDto,
  AttendanceStudentDto,
  StudentAttendanceRowDto,
} from './dto/attendance-response.dto'

const ACTIVITY_NOT_FOUND = 'ไม่พบกิจกรรม'
const STUDENT_NOT_FOUND = 'ไม่พบนักศึกษา'
const ATTENDANCE_NOT_FOUND = 'ไม่พบรายการเช็คชื่อ'
const FORBIDDEN_MESSAGE = 'คุณไม่มีสิทธิ์จัดการกิจกรรมนี้'
const DUPLICATE_MESSAGE = 'นักศึกษาคนนี้มีรายการเช็คชื่อในกิจกรรมนี้อยู่แล้ว'

const STUDENT_SELECT = { id: true, studentCode: true, firstName: true, lastName: true } as const
const ACTOR_SELECT = { id: true, username: true } as const
const BEACON_SELECT = { id: true, name: true, hwid: true } as const
const ROW_INCLUDE = {
  student: { select: STUDENT_SELECT },
  beacon: { select: BEACON_SELECT },
  checkedInByU: { select: ACTOR_SELECT },
} as const

type AttendanceRow = Prisma.AttendanceGetPayload<{ include: typeof ROW_INCLUDE }>
type StudentAttendanceRow = Prisma.AttendanceGetPayload<{
  include: { activity: { select: { name: true } }; beacon: { select: typeof BEACON_SELECT }; checkedInByU: { select: typeof ACTOR_SELECT } }
}>

/**
 * Attendance queries and manual management (spec §19, §25, §29, §35).
 * Ownership follows the activities rule: the organizer who created the
 * activity (or an admin) manages its attendance rows. Duplicate protection
 * rests on UNIQUE(activity_id, student_id) (§17) — manual check-in on an
 * already checked-in student is a 409, and every manual change is audited (§56).
 */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Rows of one activity (spec §25 columns; search matches student code/name). */
  async listByActivity(activityId: string, query: ListAttendanceDto, user: AuthUser): Promise<Paginated<AttendanceRowDto>> {
    await this.findActivityOrThrow(activityId, user)
    const { page, pageSize, order } = resolvePagination(query)

    const where: Prisma.AttendanceWhereInput = {
      activityId,
      ...(query.search && {
        student: {
          OR: [
            { studentCode: { contains: query.search, mode: 'insensitive' } },
            { firstName: { contains: query.search, mode: 'insensitive' } },
            { lastName: { contains: query.search, mode: 'insensitive' } },
          ],
        },
      }),
      ...(query.status && { status: query.status }),
      ...(query.method && { checkinMethod: query.method }),
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.attendance.findMany({
        where,
        orderBy: [{ [sortToPrismaField(query.sort)]: order }, { id: 'asc' }],
        take: pageSize,
        skip: (page - 1) * pageSize,
        include: ROW_INCLUDE,
      }),
      this.prisma.attendance.count({ where }),
    ])

    return { items: rows.map(toRowDto), total, page, pageSize }
  }

  /** A student's attendance history (spec §35) — admin-only, students are an admin domain. */
  async listByStudent(studentId: string, query: ListAttendanceDto): Promise<Paginated<StudentAttendanceRowDto>> {
    const student = await this.prisma.student.findUnique({ where: { id: studentId }, select: { id: true } })
    if (!student) throw new NotFoundException(STUDENT_NOT_FOUND)
    const { page, pageSize, order } = resolvePagination(query)

    const where: Prisma.AttendanceWhereInput = {
      studentId,
      ...(query.status && { status: query.status }),
      ...(query.method && { checkinMethod: query.method }),
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.attendance.findMany({
        where,
        orderBy: [{ [sortToPrismaField(query.sort)]: order }, { id: 'asc' }],
        take: pageSize,
        skip: (page - 1) * pageSize,
        include: {
          activity: { select: { name: true } },
          beacon: { select: BEACON_SELECT },
          checkedInByU: { select: ACTOR_SELECT },
        },
      }),
      this.prisma.attendance.count({ where }),
    ])

    return { items: rows.map(toStudentRowDto), total, page, pageSize }
  }

  /**
   * Manual check-in (spec §19): allowed even outside the check-in window
   * (§55 "หรือใช้ Manual ตาม Organizer"); check_in_at is the moment the
   * organizer performs it (§33 note); the status is chosen, not computed.
   */
  async manualCheckin(activityId: string, dto: ManualCheckinDto, user: AuthUser): Promise<AttendanceRowDto> {
    await this.findActivityOrThrow(activityId, user)
    const student = await this.prisma.student.findUnique({ where: { id: dto.studentId }, select: { id: true } })
    if (!student) throw new NotFoundException(STUDENT_NOT_FOUND)

    await this.assertNotCheckedIn(activityId, dto.studentId)
    let created
    try {
      created = await this.prisma.attendance.create({
        data: {
          activityId,
          studentId: dto.studentId,
          checkInAt: new Date(),
          status: dto.status,
          checkinMethod: 'MANUAL',
          checkedInBy: user.id,
          manualReason: dto.manualReason,
        },
        include: ROW_INCLUDE,
      })
    } catch (error) {
      // Lost the check/create race — same answer as the pre-check (§17)
      if (isUniqueViolation(error)) throw new ConflictException(DUPLICATE_MESSAGE)
      throw error
    }

    await this.audit.log({
      userId: user.id,
      action: 'ATTENDANCE_MANUAL_CREATED',
      entityType: 'ATTENDANCE',
      entityId: created.id,
      newValue: {
        activity_id: activityId,
        student_id: dto.studentId,
        status: dto.status,
        check_in_at: created.checkInAt.toISOString(),
        manual_reason: dto.manualReason,
      },
    })
    return toRowDto(created)
  }

  /** Manual attendance change (spec §19/§31) — status only; audited (§56.11). Idempotent no-op on the same status. */
  async updateAttendance(
    activityId: string,
    attendanceId: string,
    dto: UpdateAttendanceDto,
    user: AuthUser,
  ): Promise<AttendanceRowDto> {
    await this.findActivityOrThrow(activityId, user)
    const current = await this.prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: ROW_INCLUDE,
    })
    if (!current || current.activityId !== activityId) throw new NotFoundException(ATTENDANCE_NOT_FOUND)
    if (current.status === dto.status) return toRowDto(current)

    const updated = await this.prisma.attendance.update({
      where: { id: attendanceId },
      data: { status: dto.status },
      include: ROW_INCLUDE,
    })
    await this.audit.log({
      userId: user.id,
      action: 'ATTENDANCE_UPDATED',
      entityType: 'ATTENDANCE',
      entityId: attendanceId,
      oldValue: attendanceSnapshot(current),
      newValue: attendanceSnapshot(updated),
    })
    return toRowDto(updated)
  }

  private async findActivityOrThrow(activityId: string, user: AuthUser): Promise<void> {
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId },
      select: { createdBy: true },
    })
    if (!activity) throw new NotFoundException(ACTIVITY_NOT_FOUND)
    // §29 ownership — same rule as the activities module
    if (user.role !== 'ADMIN' && activity.createdBy !== user.id) {
      throw new ForbiddenException(FORBIDDEN_MESSAGE)
    }
  }

  private async assertNotCheckedIn(activityId: string, studentId: string): Promise<void> {
    const existing = await this.prisma.attendance.findUnique({
      where: { activityId_studentId: { activityId, studentId } },
      select: { id: true },
    })
    if (existing) throw new ConflictException(DUPLICATE_MESSAGE)
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

function studentDto(student: AttendanceRow['student']): AttendanceStudentDto {
  return { id: student.id, studentCode: student.studentCode, name: `${student.firstName} ${student.lastName}` }
}

function toRowDto(row: AttendanceRow): AttendanceRowDto {
  return {
    id: row.id,
    student: studentDto(row.student),
    checkInAt: row.checkInAt.toISOString(),
    status: row.status,
    checkinMethod: row.checkinMethod,
    beacon: row.beacon,
    checkedInBy: row.checkedInByU,
    manualReason: row.manualReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toStudentRowDto(row: StudentAttendanceRow): StudentAttendanceRowDto {
  return {
    id: row.id,
    activityId: row.activityId,
    activityName: row.activity.name,
    checkInAt: row.checkInAt.toISOString(),
    status: row.status,
    checkinMethod: row.checkinMethod,
    beacon: row.beacon,
    checkedInBy: row.checkedInByU,
    manualReason: row.manualReason,
  }
}

function attendanceSnapshot(row: AttendanceRow): Record<string, unknown> {
  return {
    activity_id: row.activityId,
    student_id: row.studentId,
    student_code: row.student.studentCode,
    status: row.status,
    checkin_method: row.checkinMethod,
    check_in_at: row.checkInAt.toISOString(),
  }
}
