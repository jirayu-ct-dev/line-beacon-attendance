import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, Student, StudentStatus } from '../../generated/prisma/client'
import { Paginated, resolvePagination } from '../../common/dto/pagination.dto'
import { PrismaService } from '../../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { ListStudentsDto, sortToPrismaField } from './dto/list-students.dto'
import { CreateStudentDto } from './dto/create-student.dto'
import { UpdateStudentDto } from './dto/update-student.dto'
import { StudentResponseDto } from './dto/student-response.dto'
import { parseBirthDate } from './student-validation'

const NOT_FOUND_MESSAGE = 'ไม่พบนักศึกษา'
const DUPLICATE_CODE_MESSAGE = 'รหัสนักศึกษานี้มีอยู่ในระบบแล้ว'
const INVALID_BIRTH_DATE_MESSAGE = 'วันเกิดต้องเป็นวันที่รูปแบบ YYYY-MM-DD และอยู่ระหว่างปี 1900 ถึงปัจจุบัน'

type StudentWithLink = Student & { lineAccount: { id: string } | null }

/**
 * Student management for admins (spec §27, §35). No hard delete — "delete" is
 * disable (status INACTIVE) and every mutation is audit-logged (§56).
 */
@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListStudentsDto): Promise<Paginated<StudentResponseDto>> {
    const { page, pageSize, order } = resolvePagination(query)

    // Search matches student_code / first_name / last_name, case-insensitive contains (§46)
    const where: Prisma.StudentWhereInput = {
      ...(query.search && {
        OR: [
          { studentCode: { contains: query.search, mode: 'insensitive' } },
          { firstName: { contains: query.search, mode: 'insensitive' } },
          { lastName: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
      ...(query.status && { status: query.status }),
      ...(query.year !== undefined && { year: query.year }),
    }

    const [students, total] = await this.prisma.$transaction([
      this.prisma.student.findMany({
        where,
        orderBy: [{ [sortToPrismaField(query.sort)]: order }, { id: 'asc' }],
        take: pageSize,
        skip: (page - 1) * pageSize,
        include: { lineAccount: { select: { id: true } } },
      }),
      this.prisma.student.count({ where }),
    ])

    return { items: students.map(toResponse), total, page, pageSize }
  }

  async getById(id: string): Promise<StudentResponseDto> {
    return toResponse(await this.findOrThrow(id))
  }

  async create(dto: CreateStudentDto, actorId: string): Promise<StudentResponseDto> {
    await this.assertCodeAvailable(dto.studentCode)
    const student = await this.prisma.student.create({
      data: {
        studentCode: dto.studentCode,
        firstName: dto.firstName,
        lastName: dto.lastName,
        birthDate: this.validBirthDate(dto.birthDate),
        year: dto.year,
        email: dto.email,
      },
      include: { lineAccount: { select: { id: true } } },
    })
    await this.audit.log({
      userId: actorId,
      action: 'STUDENT_CREATED',
      entityType: 'STUDENT',
      entityId: student.id,
      newValue: auditSnapshot(student),
    })
    return toResponse(student)
  }

  async update(id: string, dto: UpdateStudentDto, actorId: string): Promise<StudentResponseDto> {
    const current = await this.findOrThrow(id)
    if (dto.studentCode !== undefined && dto.studentCode !== current.studentCode) {
      await this.assertCodeAvailable(dto.studentCode)
    }

    const updated = await this.prisma.student.update({
      where: { id },
      data: {
        ...(dto.studentCode !== undefined && { studentCode: dto.studentCode }),
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.birthDate !== undefined && { birthDate: this.validBirthDate(dto.birthDate) }),
        ...(dto.year !== undefined && { year: dto.year }),
        ...(dto.email !== undefined && { email: dto.email }),
      },
      include: { lineAccount: { select: { id: true } } },
    })
    await this.audit.log({
      userId: actorId,
      action: 'STUDENT_UPDATED',
      entityType: 'STUDENT',
      entityId: id,
      oldValue: auditSnapshot(current),
      newValue: auditSnapshot(updated),
    })
    return toResponse(updated)
  }

  /** Disable/enable are the only status transitions (§35). Idempotent: re-applying the current status is a no-op (no extra audit row). */
  async setStatus(id: string, status: StudentStatus, actorId: string): Promise<StudentResponseDto> {
    const current = await this.findOrThrow(id)
    if (current.status === status) return toResponse(current)

    const updated = await this.prisma.student.update({
      where: { id },
      data: { status },
      include: { lineAccount: { select: { id: true } } },
    })
    await this.audit.log({
      userId: actorId,
      action: status === StudentStatus.INACTIVE ? 'STUDENT_DISABLED' : 'STUDENT_ENABLED',
      entityType: 'STUDENT',
      entityId: id,
      oldValue: auditSnapshot(current),
      newValue: auditSnapshot(updated),
    })
    return toResponse(updated)
  }

  /**
   * Admin unlink of a student's LINE account (spec §7.1: "ต้องมีวิธี Unlink /
   * Reset โดย Admin"). Idempotent: no link → no-op (no extra audit row).
   */
  async unlinkLine(id: string, actorId: string): Promise<StudentResponseDto> {
    const current = await this.findOrThrow(id)
    const account = await this.prisma.lineAccount.findUnique({ where: { studentId: id } })
    if (!account) return toResponse(current)

    await this.prisma.lineAccount.delete({ where: { id: account.id } })
    await this.audit.log({
      userId: actorId,
      action: 'LINE_ACCOUNT_UNLINKED',
      entityType: 'LINE_ACCOUNT',
      entityId: account.id,
      oldValue: {
        student_id: id,
        student_code: current.studentCode,
        line_user_id: account.lineUserId,
        display_name: account.displayName,
      },
    })
    return toResponse({ ...current, lineAccount: null })
  }

  private async findOrThrow(id: string): Promise<StudentWithLink> {
    const student = await this.prisma.student.findUnique({
      where: { id },
      include: { lineAccount: { select: { id: true } } },
    })
    if (!student) throw new NotFoundException(NOT_FOUND_MESSAGE)
    return student
  }

  private async assertCodeAvailable(studentCode: string): Promise<void> {
    const existing = await this.prisma.student.findUnique({ where: { studentCode }, select: { id: true } })
    if (existing) throw new ConflictException(DUPLICATE_CODE_MESSAGE)
  }

  private validBirthDate(value: string): Date {
    const parsed = parseBirthDate(value)
    if (!parsed) throw new BadRequestException(INVALID_BIRTH_DATE_MESSAGE)
    return parsed
  }
}

function toResponse(student: StudentWithLink): StudentResponseDto {
  return {
    id: student.id,
    studentCode: student.studentCode,
    firstName: student.firstName,
    lastName: student.lastName,
    birthDate: student.birthDate.toISOString().slice(0, 10),
    year: student.year,
    email: student.email,
    status: student.status,
    lineLinked: student.lineAccount !== null,
    createdAt: student.createdAt.toISOString(),
    updatedAt: student.updatedAt.toISOString(),
  }
}

/** Full old/new snapshots per spec §56 (birth_date included — it is verified PII needed for audit integrity, not a secret under §49). */
function auditSnapshot(student: Student): Record<string, unknown> {
  return {
    student_code: student.studentCode,
    first_name: student.firstName,
    last_name: student.lastName,
    birth_date: student.birthDate.toISOString().slice(0, 10),
    year: student.year,
    email: student.email,
    status: student.status,
  }
}
