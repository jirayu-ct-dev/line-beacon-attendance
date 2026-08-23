import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Activity, ActivityStatus, Beacon, Prisma, StudentStatus } from '../../generated/prisma/client'
import { Paginated, resolvePagination } from '../../common/dto/pagination.dto'
import { AuthUser } from '../../common/auth/current-user.decorator'
import { PrismaService } from '../../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { ActivityTimes, validateActivityTimes } from './activity-validation'
import { ListActivitiesDto, sortToPrismaField } from './dto/list-activities.dto'
import { CreateActivityDto } from './dto/create-activity.dto'
import { UpdateActivityDto } from './dto/update-activity.dto'
import { ActivityDetailDto, ActivityResponseDto, ActivityTimeState, AttendanceSummaryDto } from './dto/activity-response.dto'
import { BeaconResponseDto } from '../beacons/dto/beacon-response.dto'

const NOT_FOUND_MESSAGE = 'ไม่พบกิจกรรม'
const BEACON_NOT_FOUND_MESSAGE = 'ไม่พบบีคอน'
const FORBIDDEN_MESSAGE = 'คุณไม่มีสิทธิ์จัดการกิจกรรมนี้'
const PUBLISH_NEEDS_BEACON_MESSAGE = 'ต้องลิงก์บีคอนอย่างน้อย 1 ตัวก่อนเผยแพร่กิจกรรม'
const PUBLISH_CANCELLED_MESSAGE = 'กิจกรรมนี้ถูกยกเลิกไปแล้ว ไม่สามารถเผยแพร่ได้'

type ActivityWithMeta = Activity & {
  user: { id: string; username: string }
  _count: { beacons: number }
}

type ActivityDetail = Activity & {
  user: { id: string; username: string }
  beacons: (Prisma.ActivityBeaconGetPayload<{ include: { beacon: true } }>)[]
}

const TIME_FIELDS = ['startAt', 'endAt', 'checkinOpenAt', 'lateAt', 'checkinCloseAt'] as const

/**
 * Activity management (spec §11–§12, §29, §35). Ownership is flat: organizers
 * only see/manage activities they created (created_by); admins manage
 * everything (§54.12–13). No hard delete — cancel sets CANCELLED. Every
 * mutation is audit-logged (§56).
 */
@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // --- list / get ----------------------------------------------------------

  async list(query: ListActivitiesDto, user: AuthUser): Promise<Paginated<ActivityResponseDto>> {
    const { page, pageSize, order } = resolvePagination(query)
    const from = query.from !== undefined ? new Date(query.from) : undefined
    const to = query.to !== undefined ? new Date(query.to) : undefined
    if (from && to && from > to) throw new BadRequestException('ช่วงเวลาไม่ถูกต้อง — from ต้องมาก่อน to')

    // §29: organizers only see their own activities; admins see all (+ §46 organizer filter)
    const where: Prisma.ActivityWhereInput = {
      ...(user.role !== 'ADMIN' && { createdBy: user.id }),
      ...(user.role === 'ADMIN' && query.createdById && { createdBy: query.createdById }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { location: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
      ...(query.status && { status: query.status }),
      ...((from || to) && {
        startAt: {
          ...(from && { gte: from }),
          ...(to && { lte: to }),
        },
      }),
    }

    const [activities, total] = await this.prisma.$transaction([
      this.prisma.activity.findMany({
        where,
        orderBy: [{ [sortToPrismaField(query.sort)]: order }, { id: 'asc' }],
        take: pageSize,
        skip: (page - 1) * pageSize,
        include: { user: { select: { id: true, username: true } }, _count: { select: { beacons: true } } },
      }),
      this.prisma.activity.count({ where }),
    ])

    return { items: activities.map(toResponse), total, page, pageSize }
  }

  async getById(id: string, user: AuthUser): Promise<ActivityDetailDto> {
    const activity = await this.prisma.activity.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, username: true } },
        beacons: { include: { beacon: true } },
      },
    })
    if (!activity) throw new NotFoundException(NOT_FOUND_MESSAGE)
    assertCanAccess(activity, user)
    return await this.detailOf(activity)
  }

  /** Detail payload every endpoint returns — §24/§44 attendance summary included. */
  private async detailOf(activity: ActivityDetail): Promise<ActivityDetailDto> {
    return { ...toDetail(activity), attendanceSummary: await this.attendanceSummary(activity.id) }
  }

  /** §24/§44 counts: rows for Present/Late/Excused, computed Absent (never persisted). */
  private async attendanceSummary(activityId: string): Promise<AttendanceSummaryDto> {
    const [totalStudents, statusCounts] = await Promise.all([
      this.prisma.student.count({ where: { status: StudentStatus.ACTIVE } }),
      this.prisma.attendance.groupBy({
        by: ['status'],
        where: { activityId },
        _count: { _all: true },
      }),
    ])
    const by = (status: string): number => statusCounts.find((row) => row.status === status)?._count._all ?? 0
    const present = by('PRESENT')
    const late = by('LATE')
    const excused = by('EXCUSED')
    return {
      totalStudents,
      present,
      late,
      excused,
      absent: Math.max(totalStudents - present - late - excused, 0),
    }
  }

  // --- create / update -----------------------------------------------------

  async create(dto: CreateActivityDto, actorId: string): Promise<ActivityDetailDto> {
    const times = parseTimes(dto)
    const error = validateActivityTimes(times)
    if (error) throw new BadRequestException(error)

    const activity = await this.prisma.activity.create({
      data: {
        name: dto.name,
        description: dto.description,
        location: dto.location,
        ...times,
        createdBy: actorId,
      },
      include: {
        user: { select: { id: true, username: true } },
        beacons: { include: { beacon: true } },
      },
    })
    await this.audit.log({
      userId: actorId,
      action: 'ACTIVITY_CREATED',
      entityType: 'ACTIVITY',
      entityId: activity.id,
      newValue: auditSnapshot(activity),
    })
    return await this.detailOf(activity)
  }

  async update(id: string, dto: UpdateActivityDto, user: AuthUser): Promise<ActivityDetailDto> {
    const current = await this.findOrThrow(id)
    assertCanAccess(current, user)

    const merged: ActivityTimes = {
      startAt: dto.startAt !== undefined ? new Date(dto.startAt) : current.startAt,
      endAt: dto.endAt !== undefined ? new Date(dto.endAt) : current.endAt,
      checkinOpenAt: dto.checkinOpenAt !== undefined ? new Date(dto.checkinOpenAt) : current.checkinOpenAt,
      lateAt: dto.lateAt !== undefined ? new Date(dto.lateAt) : current.lateAt,
      checkinCloseAt: dto.checkinCloseAt !== undefined ? new Date(dto.checkinCloseAt) : current.checkinCloseAt,
    }
    const error = validateActivityTimes(merged)
    if (error) throw new BadRequestException(error)

    // Times of a PUBLISHED activity may have moved onto another published
    // window using the same beacons — re-run the overlap check (§38).
    const timesChanged = TIME_FIELDS.some((field) => merged[field].getTime() !== current[field].getTime())
    if (current.status === ActivityStatus.PUBLISHED && timesChanged) {
      await this.assertNoOverlap(id, merged, await this.beaconIdsOf(id))
    }

    const updated = await this.prisma.activity.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.location !== undefined && { location: dto.location }),
        ...merged,
      },
      include: {
        user: { select: { id: true, username: true } },
        beacons: { include: { beacon: true } },
      },
    })
    await this.audit.log({
      userId: user.id,
      action: 'ACTIVITY_UPDATED',
      entityType: 'ACTIVITY',
      entityId: id,
      oldValue: auditSnapshot(current),
      newValue: auditSnapshot(updated),
    })
    return await this.detailOf(updated)
  }

  // --- publish / cancel (spec §12, §35) --------------------------------------

  /**
   * DRAFT → PUBLISHED. Requires at least one linked beacon (§54.4 — a
   * published activity must be able to receive beacon events) and a check-in
   * window that does not overlap another PUBLISHED activity sharing a beacon
   * (§38, design doc §5.3). Re-publishing is a no-op; CANCELLED is final.
   */
  async publish(id: string, user: AuthUser): Promise<ActivityDetailDto> {
    const current = await this.findOrThrow(id)
    assertCanAccess(current, user)
    if (current.status === ActivityStatus.CANCELLED) throw new ConflictException(PUBLISH_CANCELLED_MESSAGE)
    if (current.status === ActivityStatus.PUBLISHED) return this.getById(id, user)

    const beaconIds = await this.beaconIdsOf(id)
    if (beaconIds.length === 0) throw new BadRequestException(PUBLISH_NEEDS_BEACON_MESSAGE)
    await this.assertNoOverlap(id, current, beaconIds)

    await this.prisma.activity.update({ where: { id }, data: { status: ActivityStatus.PUBLISHED } })
    await this.audit.log({
      userId: user.id,
      action: 'ACTIVITY_PUBLISHED',
      entityType: 'ACTIVITY',
      entityId: id,
      oldValue: auditSnapshot(current),
      newValue: { ...auditSnapshot(current), status: 'PUBLISHED' },
    })
    return this.getById(id, user)
  }

  /** DRAFT/PUBLISHED → CANCELLED (spec §35: cancel is the "delete"). Idempotent; linked beacons stay (§55 only stops check-in). */
  async cancel(id: string, user: AuthUser): Promise<ActivityDetailDto> {
    const current = await this.findOrThrow(id)
    assertCanAccess(current, user)
    if (current.status === ActivityStatus.CANCELLED) return this.getById(id, user)

    await this.prisma.activity.update({ where: { id }, data: { status: ActivityStatus.CANCELLED } })
    await this.audit.log({
      userId: user.id,
      action: 'ACTIVITY_CANCELLED',
      entityType: 'ACTIVITY',
      entityId: id,
      oldValue: auditSnapshot(current),
      newValue: { ...auditSnapshot(current), status: 'CANCELLED' },
    })
    return this.getById(id, user)
  }

  // --- activity ↔ beacon mapping (spec §14, §35) ------------------------------

  async listBeacons(id: string, user: AuthUser): Promise<BeaconResponseDto[]> {
    const activity = await this.findOrThrow(id)
    assertCanAccess(activity, user)
    const links = await this.prisma.activityBeacon.findMany({
      where: { activityId: id },
      include: { beacon: true },
      orderBy: { createdAt: 'asc' },
    })
    return links.map((link) => toBeaconResponse(link.beacon))
  }

  /**
   * Link a beacon. Allowed in DRAFT and PUBLISHED (spec §61 links before
   * publish but nothing forbids linking after). When the activity is already
   * PUBLISHED, the beacon's window must not overlap another PUBLISHED activity
   * (§38). Re-linking the same beacon is an idempotent no-op.
   */
  async linkBeacon(id: string, beaconId: string, user: AuthUser): Promise<BeaconResponseDto> {
    const activity = await this.findOrThrow(id)
    assertCanAccess(activity, user)
    const beacon = await this.prisma.beacon.findUnique({ where: { id: beaconId } })
    if (!beacon) throw new NotFoundException(BEACON_NOT_FOUND_MESSAGE)

    const existing = await this.prisma.activityBeacon.findUnique({
      where: { activityId_beaconId: { activityId: id, beaconId } },
    })
    if (existing) return toBeaconResponse(beacon)

    if (activity.status === ActivityStatus.PUBLISHED) {
      await this.assertNoOverlap(id, activity, [beaconId])
    }

    await this.prisma.activityBeacon.create({ data: { activityId: id, beaconId } })
    await this.audit.log({
      userId: user.id,
      action: 'ACTIVITY_BEACON_LINKED',
      entityType: 'ACTIVITY',
      entityId: id,
      newValue: { activity_id: id, beacon_id: beaconId, hwid: beacon.hwid },
    })
    return toBeaconResponse(beacon)
  }

  /** Unlink a beacon (idempotent — removing a link that is not there is a no-op). */
  async unlinkBeacon(id: string, beaconId: string, user: AuthUser): Promise<BeaconResponseDto> {
    const activity = await this.findOrThrow(id)
    assertCanAccess(activity, user)
    const beacon = await this.prisma.beacon.findUnique({ where: { id: beaconId } })
    if (!beacon) throw new NotFoundException(BEACON_NOT_FOUND_MESSAGE)

    const removed = await this.prisma.activityBeacon.deleteMany({ where: { activityId: id, beaconId } })
    if (removed.count > 0) {
      await this.audit.log({
        userId: user.id,
        action: 'ACTIVITY_BEACON_UNLINKED',
        entityType: 'ACTIVITY',
        entityId: id,
        oldValue: { activity_id: id, beacon_id: beaconId, hwid: beacon.hwid },
      })
    }
    return toBeaconResponse(beacon)
  }

  // --- helpers ----------------------------------------------------------------

  private async findOrThrow(id: string): Promise<ActivityWithMeta> {
    const activity = await this.prisma.activity.findUnique({
      where: { id },
      include: { user: { select: { id: true, username: true } }, _count: { select: { beacons: true } } },
    })
    if (!activity) throw new NotFoundException(NOT_FOUND_MESSAGE)
    return activity
  }

  private async beaconIdsOf(activityId: string): Promise<string[]> {
    const links = await this.prisma.activityBeacon.findMany({
      where: { activityId },
      select: { beaconId: true },
    })
    return links.map((link) => link.beaconId)
  }

  /**
   * §38: the ambiguous-match window is [checkin_open_at, checkin_close_at].
   * Only PUBLISHED activities block each other — drafts are checked again at
   * publish time. Rejects naming the conflicting activities (design doc §5.3).
   */
  private async assertNoOverlap(activityId: string, window: ActivityTimes, beaconIds: string[]): Promise<void> {
    if (beaconIds.length === 0) return
    const conflicts = await this.prisma.activityBeacon.findMany({
      where: {
        beaconId: { in: beaconIds },
        activity: {
          id: { not: activityId },
          status: ActivityStatus.PUBLISHED,
          checkinOpenAt: { lte: window.checkinCloseAt },
          checkinCloseAt: { gte: window.checkinOpenAt },
        },
      },
      include: { activity: { select: { name: true } } },
    })
    if (conflicts.length > 0) {
      const names = [...new Set(conflicts.map((link) => link.activity.name))]
      throw new ConflictException(
        `ช่วงเวลาเช็คชื่อซ้อนกับกิจกรรมที่เผยแพร่แล้วซึ่งใช้บีคอนตัวเดียวกัน: ${names.join(', ')}`,
      )
    }
  }
}

/** §29 ownership: organizer owns it, or the actor is an admin. */
function assertCanAccess(activity: { createdBy: string }, user: AuthUser): void {
  if (user.role !== 'ADMIN' && activity.createdBy !== user.id) {
    throw new ForbiddenException(FORBIDDEN_MESSAGE)
  }
}

function parseTimes(dto: CreateActivityDto): ActivityTimes {
  return {
    startAt: new Date(dto.startAt),
    endAt: new Date(dto.endAt),
    checkinOpenAt: new Date(dto.checkinOpenAt),
    lateAt: new Date(dto.lateAt),
    checkinCloseAt: new Date(dto.checkinCloseAt),
  }
}

function timeStateOf(activity: Activity): ActivityTimeState {
  const now = Date.now()
  if (now < activity.checkinOpenAt.getTime()) return 'UPCOMING'
  if (now <= activity.checkinCloseAt.getTime()) return 'CHECKIN_OPEN'
  if (now <= activity.endAt.getTime()) return 'ONGOING'
  return 'COMPLETED'
}

function toResponse(activity: ActivityWithMeta): ActivityResponseDto {
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
    status: activity.status,
    timeState: timeStateOf(activity),
    createdBy: activity.createdBy,
    creator: { id: activity.user.id, username: activity.user.username },
    beaconCount: activity._count.beacons,
    createdAt: activity.createdAt.toISOString(),
    updatedAt: activity.updatedAt.toISOString(),
  }
}

function toDetail(activity: ActivityDetail): Omit<ActivityDetailDto, 'attendanceSummary'> {
  return {
    ...toResponse({ ...activity, _count: { beacons: activity.beacons.length } }),
    beacons: activity.beacons.map((link) => toBeaconResponse(link.beacon)),
  }
}

function toBeaconResponse(beacon: Beacon): BeaconResponseDto {
  return {
    id: beacon.id,
    hwid: beacon.hwid,
    name: beacon.name,
    location: beacon.location,
    description: beacon.description,
    status: beacon.status,
    createdAt: beacon.createdAt.toISOString(),
    updatedAt: beacon.updatedAt.toISOString(),
  }
}

function auditSnapshot(activity: Activity): Record<string, unknown> {
  return {
    name: activity.name,
    description: activity.description,
    location: activity.location,
    start_at: activity.startAt.toISOString(),
    end_at: activity.endAt.toISOString(),
    checkin_open_at: activity.checkinOpenAt.toISOString(),
    late_at: activity.lateAt.toISOString(),
    checkin_close_at: activity.checkinCloseAt.toISOString(),
    status: activity.status,
  }
}
