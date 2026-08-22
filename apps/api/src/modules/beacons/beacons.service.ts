import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Beacon, BeaconStatus, Prisma } from '../../generated/prisma/client'
import { Paginated, resolvePagination } from '../../common/dto/pagination.dto'
import { PrismaService } from '../../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { ListBeaconsDto, sortToPrismaField } from './dto/list-beacons.dto'
import { CreateBeaconDto } from './dto/create-beacon.dto'
import { UpdateBeaconDto } from './dto/update-beacon.dto'
import { BeaconResponseDto } from './dto/beacon-response.dto'

const NOT_FOUND_MESSAGE = 'ไม่พบบีคอน'
const DUPLICATE_HWID_MESSAGE = 'HWID นี้ถูกลงทะเบียนไว้ในระบบแล้ว'

/**
 * Beacon management for admins (spec §13, §35). No hard delete — "delete" is
 * disable (status INACTIVE) and every mutation is audit-logged (§56).
 *
 * HWID is stored lowercase because LINE webhook events always carry the
 * lowercase form, so normalizing here keeps the exact-match lookup in
 * BeaconEventService (§37.5) correct whatever case the admin typed.
 */
@Injectable()
export class BeaconsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListBeaconsDto): Promise<Paginated<BeaconResponseDto>> {
    const { page, pageSize, order } = resolvePagination(query)

    // Search matches hwid / name / location, case-insensitive contains (§46)
    const where: Prisma.BeaconWhereInput = {
      ...(query.search && {
        OR: [
          { hwid: { contains: query.search, mode: 'insensitive' } },
          { name: { contains: query.search, mode: 'insensitive' } },
          { location: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
      ...(query.status && { status: query.status }),
    }

    const [beacons, total] = await this.prisma.$transaction([
      this.prisma.beacon.findMany({
        where,
        orderBy: [{ [sortToPrismaField(query.sort)]: order }, { id: 'asc' }],
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
      this.prisma.beacon.count({ where }),
    ])

    return { items: beacons.map(toResponse), total, page, pageSize }
  }

  async getById(id: string): Promise<BeaconResponseDto> {
    return toResponse(await this.findOrThrow(id))
  }

  async create(dto: CreateBeaconDto, actorId: string): Promise<BeaconResponseDto> {
    const hwid = normalizeHwid(dto.hwid)
    await this.assertHwidAvailable(hwid)
    const beacon = await this.prisma.beacon.create({
      data: { hwid, name: dto.name, location: dto.location, description: dto.description },
    })
    await this.audit.log({
      userId: actorId,
      action: 'BEACON_CREATED',
      entityType: 'BEACON',
      entityId: beacon.id,
      newValue: auditSnapshot(beacon),
    })
    return toResponse(beacon)
  }

  async update(id: string, dto: UpdateBeaconDto, actorId: string): Promise<BeaconResponseDto> {
    const current = await this.findOrThrow(id)
    const hwid = dto.hwid !== undefined ? normalizeHwid(dto.hwid) : undefined
    if (hwid !== undefined && hwid !== current.hwid) {
      await this.assertHwidAvailable(hwid)
    }

    const updated = await this.prisma.beacon.update({
      where: { id },
      data: {
        ...(hwid !== undefined && { hwid }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.location !== undefined && { location: dto.location }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
    })
    await this.audit.log({
      userId: actorId,
      action: 'BEACON_UPDATED',
      entityType: 'BEACON',
      entityId: id,
      oldValue: auditSnapshot(current),
      newValue: auditSnapshot(updated),
    })
    return toResponse(updated)
  }

  /** Disable/enable are the primary status transitions (§35). Idempotent: re-applying the current status is a no-op (no extra audit row). */
  async setStatus(id: string, status: BeaconStatus, actorId: string): Promise<BeaconResponseDto> {
    const current = await this.findOrThrow(id)
    if (current.status === status) return toResponse(current)

    const updated = await this.prisma.beacon.update({ where: { id }, data: { status } })
    await this.audit.log({
      userId: actorId,
      action: status === BeaconStatus.INACTIVE ? 'BEACON_DISABLED' : 'BEACON_ENABLED',
      entityType: 'BEACON',
      entityId: id,
      oldValue: auditSnapshot(current),
      newValue: auditSnapshot(updated),
    })
    return toResponse(updated)
  }

  private async findOrThrow(id: string): Promise<Beacon> {
    const beacon = await this.prisma.beacon.findUnique({ where: { id } })
    if (!beacon) throw new NotFoundException(NOT_FOUND_MESSAGE)
    return beacon
  }

  private async assertHwidAvailable(hwid: string): Promise<void> {
    const existing = await this.prisma.beacon.findUnique({ where: { hwid }, select: { id: true } })
    if (existing) throw new ConflictException(DUPLICATE_HWID_MESSAGE)
  }
}

function normalizeHwid(hwid: string): string {
  return hwid.toLowerCase()
}

function toResponse(beacon: Beacon): BeaconResponseDto {
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

function auditSnapshot(beacon: Beacon): Record<string, unknown> {
  return {
    hwid: beacon.hwid,
    name: beacon.name,
    location: beacon.location,
    description: beacon.description,
    status: beacon.status,
  }
}
