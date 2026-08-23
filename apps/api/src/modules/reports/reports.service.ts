import { ForbiddenException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common'
import { Workbook } from 'exceljs'
import { Prisma, StudentStatus } from '../../generated/prisma/client'
import { AuthUser } from '../../common/auth/current-user.decorator'
import { PrismaService } from '../../prisma/prisma.service'
import { AttendanceSummaryDto } from '../activities/dto/activity-response.dto'
import { AttendanceRowDto, StudentAttendanceRowDto } from '../attendance/dto/attendance-response.dto'
import { ActivityReportDto, StudentReportDto } from './dto/report-response.dto'

const ACTIVITY_NOT_FOUND = 'ไม่พบกิจกรรม'
const STUDENT_NOT_FOUND = 'ไม่พบนักศึกษา'
const FORBIDDEN_MESSAGE = 'คุณไม่มีสิทธิ์จัดการกิจกรรมนี้'

const CSV_CONTENT_TYPE = 'text/csv; charset=utf-8'
const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// Labels match the web UI (status always carries a Thai text label; method
// labels mirror the attendance page) so exports read the same as the screen.
const STATUS_LABELS: Record<string, string> = { PRESENT: 'เข้าร่วม', LATE: 'มาสาย', ABSENT: 'ขาด', EXCUSED: 'ลา' }
const METHOD_LABELS: Record<string, string> = { BEACON: 'Beacon', MANUAL: 'เช็คชื่อแทน' }
const LIST_HEADERS = ['รหัสนักศึกษา', 'ชื่อ-สกุล', 'เวลาเช็คชื่อ', 'สถานะ', 'ช่องทาง', 'บีคอน (HWID)', 'บันทึกโดย', 'หมายเหตุ']

const bangkokDateTime = new Intl.DateTimeFormat('th-TH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Bangkok',
  hourCycle: 'h23',
})

const STUDENT_SELECT = { id: true, studentCode: true, firstName: true, lastName: true } as const
const ACTOR_SELECT = { id: true, username: true } as const
const BEACON_SELECT = { id: true, name: true, hwid: true } as const
const ROW_INCLUDE = {
  student: { select: STUDENT_SELECT },
  beacon: { select: BEACON_SELECT },
  checkedInByU: { select: ACTOR_SELECT },
} as const

type ReportRow = Prisma.AttendanceGetPayload<{ include: typeof ROW_INCLUDE }>
type StudentReportRow = Prisma.AttendanceGetPayload<{
  include: { activity: { select: { name: true } }; beacon: { select: typeof BEACON_SELECT }; checkedInByU: { select: typeof ACTOR_SELECT } }
}>

/** An export file ready to stream: bytes + headers the controller sets. */
export interface ReportFile {
  file: StreamableFile
  contentType: string
  filename: string
}

/**
 * Reports (spec §44, §35): activity attendance summary + full list, export as
 * CSV/Excel, and a per-student history report. Read-only — every count is
 * computed at report time (absent is never persisted). Ownership follows the
 * activities rule (§29): the creating organizer or an admin.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async activityReport(activityId: string, user: AuthUser): Promise<ActivityReportDto> {
    const { activity, rows, summary } = await this.loadActivityReport(activityId, user)
    return {
      activity: {
        id: activity.id,
        name: activity.name,
        startAt: activity.startAt.toISOString(),
        endAt: activity.endAt.toISOString(),
        checkinOpenAt: activity.checkinOpenAt.toISOString(),
        checkinCloseAt: activity.checkinCloseAt.toISOString(),
        status: activity.status,
        organizer: activity.user,
      },
      summary,
      attendances: rows.map(toRowDto),
    }
  }

  async exportActivity(activityId: string, format: 'csv' | 'xlsx', user: AuthUser): Promise<ReportFile> {
    const { activity, rows, summary } = await this.loadActivityReport(activityId, user)
    const filename = `รายงาน-${sanitizeFilename(activity.name)}`
    if (format === 'xlsx') {
      return {
        file: new StreamableFile(await buildActivityXlsx(activity, summary, rows)),
        contentType: XLSX_CONTENT_TYPE,
        filename: `${filename}.xlsx`,
      }
    }
    return {
      file: new StreamableFile(Buffer.from(buildActivityCsv(activity, summary, rows), 'utf8')),
      contentType: CSV_CONTENT_TYPE,
      filename: `${filename}.csv`,
    }
  }

  async studentReport(studentId: string): Promise<StudentReportDto> {
    const student = await this.prisma.student.findUnique({ where: { id: studentId } })
    if (!student) throw new NotFoundException(STUDENT_NOT_FOUND)

    const rows = await this.prisma.attendance.findMany({
      where: { studentId },
      include: {
        activity: { select: { name: true } },
        beacon: { select: BEACON_SELECT },
        checkedInByU: { select: ACTOR_SELECT },
      },
      orderBy: [{ checkInAt: 'desc' }, { id: 'asc' }],
    })
    const count = (status: string): number => rows.filter((row) => row.status === status).length
    return {
      student: {
        id: student.id,
        studentCode: student.studentCode,
        name: `${student.firstName} ${student.lastName}`,
        status: student.status,
      },
      summary: { total: rows.length, present: count('PRESENT'), late: count('LATE'), excused: count('EXCUSED') },
      attendances: rows.map(toStudentRowDto),
    }
  }

  /** Everything both the JSON report and the export need, in one load. */
  private async loadActivityReport(activityId: string, user: AuthUser) {
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId },
      include: { user: { select: { id: true, username: true } } },
    })
    if (!activity) throw new NotFoundException(ACTIVITY_NOT_FOUND)
    // §29 ownership — same rule as the activities module
    if (user.role !== 'ADMIN' && activity.createdBy !== user.id) {
      throw new ForbiddenException(FORBIDDEN_MESSAGE)
    }

    const [rows, totalStudents] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { activityId },
        include: ROW_INCLUDE,
        orderBy: [{ student: { studentCode: 'asc' } }, { id: 'asc' }],
      }),
      this.prisma.student.count({ where: { status: StudentStatus.ACTIVE } }),
    ])
    // §44 counts: Present/Late/Excused from the rows; Absent computed, never persisted
    const count = (status: string): number => rows.filter((row) => row.status === status).length
    const present = count('PRESENT')
    const late = count('LATE')
    const excused = count('EXCUSED')
    const summary: AttendanceSummaryDto = {
      totalStudents,
      present,
      late,
      excused,
      absent: Math.max(totalStudents - present - late - excused, 0),
    }
    return { activity, rows, summary }
  }
}

function toRowDto(row: ReportRow): AttendanceRowDto {
  return {
    id: row.id,
    student: {
      id: row.student.id,
      studentCode: row.student.studentCode,
      name: `${row.student.firstName} ${row.student.lastName}`,
    },
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

function toStudentRowDto(row: StudentReportRow): StudentAttendanceRowDto {
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

/** Strips characters Windows/macOS forbids in filenames; falls back to the id. */
function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\r\n]/g, ' ').trim()
  return cleaned.length > 0 ? cleaned : 'กิจกรรม'
}

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function listRowValues(row: ReportRow): string[] {
  return [
    row.student.studentCode,
    `${row.student.firstName} ${row.student.lastName}`,
    bangkokDateTime.format(row.checkInAt),
    STATUS_LABELS[row.status] ?? row.status,
    METHOD_LABELS[row.checkinMethod] ?? row.checkinMethod,
    row.beacon?.hwid ?? '',
    row.checkedInByU?.username ?? '',
    row.manualReason ?? '',
  ]
}

/**
 * CSV layout: summary block (§44 header fields) then the attendance list
 * (§25 columns). UTF-8 BOM so Excel opens the Thai text correctly.
 */
function buildActivityCsv(
  activity: { name: string; startAt: Date; endAt: Date; user: { username: string } },
  summary: AttendanceSummaryDto,
  rows: ReportRow[],
): string {
  const lines = [
    'รายงานการเช็คชื่อกิจกรรม',
    `ชื่อกิจกรรม,${csvField(activity.name)}`,
    `วันที่,${csvField(`${bangkokDateTime.format(activity.startAt)} – ${bangkokDateTime.format(activity.endAt)}`)}`,
    `ผู้จัด,${csvField(activity.user.username)}`,
    `นักศึกษาทั้งหมด,${summary.totalStudents}`,
    `เข้าร่วม,${summary.present}`,
    `มาสาย,${summary.late}`,
    `ขาด,${summary.absent}`,
    `ลา,${summary.excused}`,
    '',
    LIST_HEADERS.join(','),
    ...rows.map((row) => listRowValues(row).map(csvField).join(',')),
  ]
  return `\uFEFF${lines.join('\r\n')}`
}

async function buildActivityXlsx(
  activity: { name: string; startAt: Date; endAt: Date; user: { username: string } },
  summary: AttendanceSummaryDto,
  rows: ReportRow[],
): Promise<Buffer> {
  const workbook = new Workbook()
  const sheet = workbook.addWorksheet('รายงาน')

  sheet.addRow(['รายงานการเช็คชื่อกิจกรรม']).font = { bold: true, size: 14 }
  sheet.addRow([])
  for (const [label, value] of [
    ['ชื่อกิจกรรม', activity.name],
    ['วันที่', `${bangkokDateTime.format(activity.startAt)} – ${bangkokDateTime.format(activity.endAt)}`],
    ['ผู้จัด', activity.user.username],
  ] as const) {
    const row = sheet.addRow([label, value])
    row.getCell(1).font = { bold: true }
  }
  sheet.addRow([])
  for (const [label, value] of [
    ['นักศึกษาทั้งหมด', summary.totalStudents],
    ['เข้าร่วม', summary.present],
    ['มาสาย', summary.late],
    ['ขาด', summary.absent],
    ['ลา', summary.excused],
  ] as const) {
    const row = sheet.addRow([label, value])
    row.getCell(1).font = { bold: true }
  }
  sheet.addRow([])

  sheet.addRow(LIST_HEADERS).font = { bold: true }
  for (const row of rows) sheet.addRow(listRowValues(row))
  sheet.columns = [{ width: 20 }, { width: 32 }, { width: 20 }, { width: 10 }, { width: 12 }, { width: 16 }, { width: 14 }, { width: 32 }]

  // Cast: exceljs' own typings pin an ArrayBuffer-like Buffer (same as the
  // students import path); convert to a Node Buffer for StreamableFile.
  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer as ArrayBuffer)
}
