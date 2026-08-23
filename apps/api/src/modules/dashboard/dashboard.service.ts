import { Injectable } from '@nestjs/common'
import { Prisma } from '../../generated/prisma/client'
import { AuthUser } from '../../common/auth/current-user.decorator'
import { PrismaService } from '../../prisma/prisma.service'
import { ActivityStatus } from '../../generated/prisma/client'
import type { DashboardResponseDto, RecentActivityDto } from './dto/dashboard-response.dto'

/** Thailand has no DST — the fixed +07:00 offset is exact year-round (spec §43). */
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000

/** Midnight of the current Bangkok calendar day, expressed as a UTC instant. */
const startOfBangkokDay = (now = new Date()): Date => {
  const shifted = new Date(now.getTime() + BANGKOK_OFFSET_MS)
  shifted.setUTCHours(0, 0, 0, 0)
  return new Date(shifted.getTime() - BANGKOK_OFFSET_MS)
}

const RECENT_LIMIT = 5
const OPEN_CHECKIN_LIMIT = 5

/**
 * Dashboard overview (spec §23, §45). Scoped by the flat ownership rule
 * (§29): organizers see their own activities' numbers, admins see everything.
 * "Today" follows the Bangkok calendar day the dashboard displays in (§43).
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(user: AuthUser): Promise<DashboardResponseDto> {
    const now = new Date()
    const todayStart = startOfBangkokDay(now)
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
    const scope: Prisma.ActivityWhereInput = user.role === 'ADMIN' ? {} : { createdBy: user.id }
    const attendanceScope = { activity: scope }

    const [totalActivities, activitiesToday, checkinsToday, presentToday, lateToday] = await this.prisma.$transaction([
      this.prisma.activity.count({ where: scope }),
      this.prisma.activity.count({ where: { ...scope, startAt: { gte: todayStart, lt: tomorrowStart } } }),
      this.prisma.attendance.count({ where: { ...attendanceScope, checkInAt: { gte: todayStart } } }),
      this.prisma.attendance.count({
        where: { ...attendanceScope, checkInAt: { gte: todayStart }, status: 'PRESENT' },
      }),
      this.prisma.attendance.count({
        where: { ...attendanceScope, checkInAt: { gte: todayStart }, status: 'LATE' },
      }),
    ])

    const recent = await this.prisma.activity.findMany({
      where: scope,
      orderBy: { createdAt: 'desc' },
      take: RECENT_LIMIT,
    })
    const open = await this.prisma.activity.findMany({
      where: {
        ...scope,
        status: ActivityStatus.PUBLISHED,
        checkinOpenAt: { lte: now },
        checkinCloseAt: { gte: now },
      },
      orderBy: { checkinCloseAt: 'asc' },
      take: OPEN_CHECKIN_LIMIT,
    })
    const counts = open.length
      ? await this.prisma.attendance.groupBy({
          by: ['activityId', 'status'],
          where: { activityId: { in: open.map((a) => a.id) } },
          _count: { _all: true },
        })
      : []

    return {
      today: { activities: activitiesToday, checkins: checkinsToday, present: presentToday, late: lateToday },
      totalActivities,
      recentActivities: recent.map(toRecent),
      openCheckinActivities: open.map((activity) => {
        const present = counts.find((c) => c.activityId === activity.id && c.status === 'PRESENT')?._count._all ?? 0
        const late = counts.find((c) => c.activityId === activity.id && c.status === 'LATE')?._count._all ?? 0
        return {
          id: activity.id,
          name: activity.name,
          checkinOpenAt: activity.checkinOpenAt.toISOString(),
          checkinCloseAt: activity.checkinCloseAt.toISOString(),
          lateAt: activity.lateAt.toISOString(),
          present,
          late,
        }
      }),
    }
  }
}

/** Same computed state as the activities module (spec §12) — never persisted. */
const timeStateOf = (activity: { checkinOpenAt: Date; checkinCloseAt: Date; endAt: Date }): RecentActivityDto['timeState'] => {
  const now = Date.now()
  if (now < activity.checkinOpenAt.getTime()) return 'UPCOMING'
  if (now <= activity.checkinCloseAt.getTime()) return 'CHECKIN_OPEN'
  if (now <= activity.endAt.getTime()) return 'ONGOING'
  return 'COMPLETED'
}

const toRecent = (activity: {
  id: string
  name: string
  startAt: Date
  endAt: Date
  status: ActivityStatus
  checkinOpenAt: Date
  checkinCloseAt: Date
}): RecentActivityDto => ({
  id: activity.id,
  name: activity.name,
  startAt: activity.startAt.toISOString(),
  status: activity.status,
  timeState: timeStateOf(activity),
})
