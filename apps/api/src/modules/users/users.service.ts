import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { hash } from 'argon2'
import { User, UserStatus } from '../../generated/prisma/client'
import { Paginated, resolvePagination } from '../../common/dto/pagination.dto'
import { AuthUser } from '../../common/auth/current-user.decorator'
import { PrismaService } from '../../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { CreateUserDto } from './dto/create-user.dto'
import { UpdateUserDto } from './dto/update-user.dto'
import { ListUsersDto, sortToPrismaField } from './dto/list-users.dto'
import { UserResponseDto } from './dto/user-response.dto'

const NOT_FOUND_MESSAGE = 'ไม่พบผู้ใช้งาน'
const DUPLICATE_MESSAGE = 'อีเมลหรือชื่อผู้ใช้นี้มีอยู่ในระบบแล้ว'
const SELF_LOCK_MESSAGE = 'ไม่สามารถเปลี่ยนบทบาทหรือสถานะของบัญชีที่กำลังใช้งานอยู่ของตัวเองได้'

/**
 * Organizer/admin account management (spec §28, §4.3). Admin-only. No hard
 * delete — disable instead (§35 pattern); disabling also revokes the user's
 * refresh tokens so the session dies at the next refresh (login/refresh
 * already reject INACTIVE users). Every mutation is audit-logged (§56).
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListUsersDto): Promise<Paginated<UserResponseDto>> {
    const { page, pageSize, order } = resolvePagination(query)
    const where = {
      ...(query.search && {
        OR: [
          { email: { contains: query.search, mode: 'insensitive' as const } },
          { username: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
      ...(query.role && { role: query.role }),
      ...(query.status && { status: query.status }),
    }

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: [{ [sortToPrismaField(query.sort)]: order }, { id: 'asc' }],
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
      this.prisma.user.count({ where }),
    ])

    return { items: users.map(toResponse), total, page, pageSize }
  }

  async getById(id: string): Promise<UserResponseDto> {
    return toResponse(await this.findOrThrow(id))
  }

  async create(dto: CreateUserDto, actorId: string): Promise<UserResponseDto> {
    await this.assertEmailUsernameAvailable(dto.email, dto.username)
    const user = await this.prisma.user.create({
      data: { email: dto.email, username: dto.username, role: dto.role, passwordHash: await hash(dto.password) },
    })
    await this.audit.log({
      userId: actorId,
      action: 'USER_CREATED',
      entityType: 'USER',
      entityId: user.id,
      newValue: { email: user.email, username: user.username, role: user.role },
    })
    return toResponse(user)
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthUser): Promise<UserResponseDto> {
    const current = await this.findOrThrow(id)
    // Changing your own role/status is the one self-service hole — block it
    if (id === actor.id && dto.role !== undefined && dto.role !== current.role) {
      throw new BadRequestException(SELF_LOCK_MESSAGE)
    }
    if (dto.email !== undefined && dto.email !== current.email) await this.assertEmailAvailable(dto.email)
    if (dto.username !== undefined && dto.username !== current.username) {
      await this.assertUsernameAvailable(dto.username)
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.username !== undefined && { username: dto.username }),
        ...(dto.role !== undefined && { role: dto.role }),
      },
    })
    await this.audit.log({
      userId: actor.id,
      action: 'USER_UPDATED',
      entityType: 'USER',
      entityId: id,
      oldValue: { email: current.email, username: current.username, role: current.role },
      newValue: { email: updated.email, username: updated.username, role: updated.role },
    })
    return toResponse(updated)
  }

  /** Disable/enable (§28). Idempotent like the students/beacons pattern; disabling revokes sessions. */
  async setStatus(id: string, status: UserStatus, actor: AuthUser): Promise<UserResponseDto> {
    const current = await this.findOrThrow(id)
    if (id === actor.id && status !== current.status) throw new BadRequestException(SELF_LOCK_MESSAGE)
    if (current.status === status) return toResponse(current)

    const updated = await this.prisma.user.update({ where: { id }, data: { status } })
    if (status === UserStatus.INACTIVE) {
      await this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } })
    }
    await this.audit.log({
      userId: actor.id,
      action: status === UserStatus.INACTIVE ? 'USER_DISABLED' : 'USER_ENABLED',
      entityType: 'USER',
      entityId: id,
      oldValue: { username: current.username, status: current.status },
      newValue: { username: updated.username, status: updated.status },
    })
    return toResponse(updated)
  }

  /** Reset password (§28) — revokes every refresh token so old sessions cannot continue. */
  async resetPassword(id: string, newPassword: string, actor: AuthUser): Promise<UserResponseDto> {
    const current = await this.findOrThrow(id)
    const updated = await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await hash(newPassword) },
    })
    await this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } })
    await this.audit.log({
      userId: actor.id,
      action: 'USER_PASSWORD_RESET',
      entityType: 'USER',
      entityId: id,
      oldValue: { username: current.username },
      newValue: { username: updated.username },
    })
    return toResponse(updated)
  }

  private async findOrThrow(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } })
    if (!user) throw new NotFoundException(NOT_FOUND_MESSAGE)
    return user
  }

  private async assertEmailUsernameAvailable(email: string, username: string): Promise<void> {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
      select: { id: true },
    })
    if (existing) throw new ConflictException(DUPLICATE_MESSAGE)
  }

  private async assertEmailAvailable(email: string): Promise<void> {
    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } })
    if (existing) throw new ConflictException(DUPLICATE_MESSAGE)
  }

  private async assertUsernameAvailable(username: string): Promise<void> {
    const existing = await this.prisma.user.findUnique({ where: { username }, select: { id: true } })
    if (existing) throw new ConflictException(DUPLICATE_MESSAGE)
  }
}

function toResponse(user: User): UserResponseDto {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  }
}
