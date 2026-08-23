import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '../../generated/prisma/client'
import { Paginated, resolvePagination } from '../../common/dto/pagination.dto'
import { PrismaService } from '../../prisma/prisma.service'
import { ListAuditLogsDto, sortToPrismaField } from './dto/list-audit-logs.dto'
import { AuditLogDetailDto, AuditLogResponseDto } from './dto/audit-log-response.dto'

const NOT_FOUND_MESSAGE = 'ไม่พบรายการ audit log'

const USER_SELECT = { id: true, username: true } as const
const ROW_INCLUDE = { user: { select: USER_SELECT } } as const
type AuditLogRow = Prisma.AuditLogGetPayload<{ include: typeof ROW_INCLUDE }>

/** Read-only audit_logs viewer for admins (spec §26, §56). Rows are written by AuditService. */
@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListAuditLogsDto): Promise<Paginated<AuditLogResponseDto>> {
    const { page, pageSize, order } = resolvePagination(query)
    const from = query.from !== undefined ? new Date(query.from) : undefined
    const to = query.to !== undefined ? new Date(query.to) : undefined
    if (from && to && from > to) throw new BadRequestException('ช่วงเวลาไม่ถูกต้อง — from ต้องมาก่อน to')

    const where: Prisma.AuditLogWhereInput = {
      ...(query.search && {
        OR: [
          { action: { contains: query.search, mode: 'insensitive' } },
          { entityId: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
      ...(query.action && { action: query.action }),
      ...(query.userId && { userId: query.userId }),
      ...(query.entityType && { entityType: query.entityType }),
      ...((from || to) && {
        createdAt: {
          ...(from && { gte: from }),
          ...(to && { lte: to }),
        },
      }),
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ [sortToPrismaField(query.sort)]: order }, { id: 'asc' }],
        take: pageSize,
        skip: (page - 1) * pageSize,
        include: ROW_INCLUDE,
      }),
      this.prisma.auditLog.count({ where }),
    ])

    return { items: rows.map(toResponse), total, page, pageSize }
  }

  async getById(id: string): Promise<AuditLogDetailDto> {
    const row = await this.prisma.auditLog.findUnique({ where: { id }, include: ROW_INCLUDE })
    if (!row) throw new NotFoundException(NOT_FOUND_MESSAGE)
    return { ...toResponse(row), oldValue: row.oldValue, newValue: row.newValue }
  }
}

function toResponse(row: AuditLogRow): AuditLogResponseDto {
  return {
    id: row.id,
    user: row.user ? { id: row.user.id, username: row.user.username } : null,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    createdAt: row.createdAt.toISOString(),
  }
}
