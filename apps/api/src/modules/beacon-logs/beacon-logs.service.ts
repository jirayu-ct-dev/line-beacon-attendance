import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { BeaconLog, Prisma } from '../../generated/prisma/client'
import { Paginated, resolvePagination } from '../../common/dto/pagination.dto'
import { PrismaService } from '../../prisma/prisma.service'
import { ListBeaconLogsDto, sortToPrismaField } from './dto/list-beacon-logs.dto'
import { BeaconLogDetailDto, BeaconLogResponseDto } from './dto/beacon-log-response.dto'

const NOT_FOUND_MESSAGE = 'ไม่พบรายการบันทึกบีคอน'

const STUDENT_SELECT = { id: true, studentCode: true, firstName: true, lastName: true } as const
const BEACON_SELECT = { id: true, name: true } as const

type BeaconLogWithRelations = BeaconLog & {
  student: { id: string; studentCode: string; firstName: string; lastName: string } | null
  beacon: { id: string; name: string } | null
}

/**
 * Read-only beacon_logs viewer for admins (spec §18, §26). Rows are written
 * by the LINE webhook pipeline — this module never mutates them.
 */
@Injectable()
export class BeaconLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListBeaconLogsDto): Promise<Paginated<BeaconLogResponseDto>> {
    const { page, pageSize, order } = resolvePagination(query)
    const where = this.buildWhere(query)

    const [logs, total] = await this.prisma.$transaction([
      this.prisma.beaconLog.findMany({
        where,
        orderBy: [{ [sortToPrismaField(query.sort)]: order }, { id: 'asc' }],
        take: pageSize,
        skip: (page - 1) * pageSize,
        include: { student: { select: STUDENT_SELECT }, beacon: { select: BEACON_SELECT } },
      }),
      this.prisma.beaconLog.count({ where }),
    ])

    return { items: logs.map(toResponse), total, page, pageSize }
  }

  async getById(id: string): Promise<BeaconLogDetailDto> {
    const log = await this.prisma.beaconLog.findUnique({
      where: { id },
      include: { student: { select: STUDENT_SELECT }, beacon: { select: BEACON_SELECT } },
    })
    if (!log) throw new NotFoundException(NOT_FOUND_MESSAGE)
    return { ...toResponse(log), rawPayload: log.rawPayload }
  }

  private buildWhere(query: ListBeaconLogsDto): Prisma.BeaconLogWhereInput {
    const from = query.from !== undefined ? new Date(query.from) : undefined
    const to = query.to !== undefined ? new Date(query.to) : undefined
    if (from && to && from > to) {
      throw new BadRequestException('ช่วงเวลาไม่ถูกต้อง — from ต้องมาก่อน to')
    }

    return {
      // Search matches line_user_id / webhook_event_id / hwid (§46)
      ...(query.search && {
        OR: [
          { lineUserId: { contains: query.search, mode: 'insensitive' } },
          { webhookEventId: { contains: query.search, mode: 'insensitive' } },
          { hwid: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
      // Logs store the lowercase hwid exactly as LINE sends it (§9)
      ...(query.hwid && { hwid: query.hwid.toLowerCase() }),
      ...(query.studentId && { studentId: query.studentId }),
      ...(query.status && { processingStatus: query.status }),
      ...((from || to) && {
        eventTimestamp: {
          ...(from && { gte: from }),
          ...(to && { lte: to }),
        },
      }),
    }
  }
}

function toResponse(log: BeaconLogWithRelations): BeaconLogResponseDto {
  return {
    id: log.id,
    lineUserId: log.lineUserId,
    student: log.student
      ? { id: log.student.id, studentCode: log.student.studentCode, name: `${log.student.firstName} ${log.student.lastName}` }
      : null,
    beacon: log.beacon ? { id: log.beacon.id, name: log.beacon.name } : null,
    hwid: log.hwid,
    eventType: log.eventType,
    eventTimestamp: log.eventTimestamp.toISOString(),
    webhookEventId: log.webhookEventId,
    processingStatus: log.processingStatus,
    createdAt: log.createdAt.toISOString(),
  }
}
