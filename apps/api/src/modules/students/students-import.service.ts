import { BadRequestException, Injectable } from '@nestjs/common'
import { Workbook } from 'exceljs'
import { parse as parseCsv } from 'csv-parse/sync'
import { PrismaService } from '../../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { parseBirthDate, STUDENT_CODE_RE } from './student-validation'

/**
 * Student data import (spec §8): CSV or XLSX with header
 *   student_code,first_name,last_name,birth_date,year[,email]
 * (birth_date is mandatory in the file — it is verified later during LINE linking).
 *
 * Two-step flow: `preview` validates without writing; `apply` re-validates the
 * uploaded file and writes only the valid rows. Semantics for existing
 * student_code = update that student's data (upsert; status is never touched),
 * because §8 does not define skip behavior and upsert keeps re-imports idempotent.
 */
@Injectable()
export class StudentsImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async preview(file: Express.Multer.File): Promise<ImportPreviewResult> {
    const rows = await this.parseAndValidate(file)
    return {
      totalRows: rows.length,
      validRows: rows.filter((r) => r.valid).length,
      errorRows: rows.filter((r) => !r.valid).length,
      rows: rows.map(toRowResult),
    }
  }

  async apply(file: Express.Multer.File, actorId: string): Promise<ImportApplyResult> {
    const rows = await this.parseAndValidate(file)
    const valid = rows.filter((r) => r.valid)
    const errors = rows.filter((r) => !r.valid).map(toRowResult)

    const codes = valid.map((r) => r.data!.studentCode)
    const existing = new Set(
      (
        await this.prisma.student.findMany({
          where: { studentCode: { in: codes } },
          select: { studentCode: true },
        })
      ).map((s) => s.studentCode),
    )
    const toCreate = valid.filter((r) => !existing.has(r.data!.studentCode))
    const toUpdate = valid.filter((r) => existing.has(r.data!.studentCode))

    // Status is deliberately not part of the update data — imports never change status.
    await this.prisma.$transaction([
      ...toCreate.map((r) =>
        this.prisma.student.create({
          data: {
            studentCode: r.data!.studentCode,
            firstName: r.data!.firstName,
            lastName: r.data!.lastName,
            birthDate: r.data!.birthDate,
            year: r.data!.year,
            email: r.data!.email,
          },
        }),
      ),
      ...toUpdate.map((r) =>
        this.prisma.student.update({
          where: { studentCode: r.data!.studentCode },
          data: {
            firstName: r.data!.firstName,
            lastName: r.data!.lastName,
            birthDate: r.data!.birthDate,
            year: r.data!.year,
            email: r.data!.email,
          },
        }),
      ),
    ])

    await this.audit.log({
      userId: actorId,
      action: 'STUDENT_IMPORTED',
      entityType: 'STUDENT',
      entityId: 'import',
      newValue: {
        file_name: file.originalname,
        total_rows: rows.length,
        created: toCreate.length,
        updated: toUpdate.length,
        error_rows: errors.length,
      },
    })

    return { created: toCreate.length, updated: toUpdate.length, errorRows: errors.length, errors }
  }

  // --- parsing -------------------------------------------------------------

  private async parseAndValidate(file: Express.Multer.File): Promise<RowValidation[]> {
    if (file.buffer.byteLength === 0) throw new BadRequestException('ไฟล์ว่าง')
    if (file.buffer.byteLength > MAX_FILE_BYTES) {
      throw new BadRequestException('ไฟล์มีขนาดเกิน 5MB')
    }

    const extension = file.originalname.toLowerCase().split('.').pop()
    let rows: RawRow[]
    if (extension === 'csv') rows = parseCsvFile(file.buffer)
    else if (extension === 'xlsx') rows = await parseXlsxFile(file.buffer)
    else throw new BadRequestException('รองรับเฉพาะไฟล์ .csv หรือ .xlsx')

    const dataRows = rows.filter((r) => Object.values(r.values).some((v) => v !== ''))
    if (dataRows.length === 0) throw new BadRequestException('ไม่พบแถวข้อมูลในไฟล์')
    if (dataRows.length > MAX_ROWS) {
      throw new BadRequestException(`ไฟล์มีจำนวนแถวเกิน ${MAX_ROWS} แถว กรุณาแบ่งไฟล์เป็นหลายส่วน`)
    }
    return dataRows.map((row) => validateRow(row, rows))
  }
}

// --- file parsing ----------------------------------------------------------

const MAX_ROWS = 1000
const MAX_FILE_BYTES = 5 * 1024 * 1024
const REQUIRED_COLUMNS = ['student_code', 'first_name', 'last_name', 'birth_date', 'year'] // email optional (§8)
const MISSING_COLUMNS_MESSAGE = (missing: string[]) =>
  `ส่วนหัวไฟล์ไม่ถูกต้อง: ไม่พบคอลัมน์ที่จำเป็น (${missing.join(', ')})`

/** A physical file row (spreadsheet row number; header row = 1). */
interface RawRow {
  rowNumber: number
  values: Record<string, string>
}

function parseCsvFile(buffer: Buffer): RawRow[] {
  // Blank lines are kept as empty records so rowNumber matches the file line number.
  const records: string[][] = parseCsv(buffer.toString('utf8'), { bom: true, trim: true })
  if (records.length === 0) return []

  const header = records[0].map((column) => column.trim().toLowerCase())
  const missing = REQUIRED_COLUMNS.filter((column) => !header.includes(column))
  if (missing.length > 0) throw new BadRequestException(MISSING_COLUMNS_MESSAGE(missing))

  return records.slice(1).map((record, index) => ({
    rowNumber: index + 2, // +2: header is row 1, records are 0-based
    values: recordToValues(header, record),
  }))
}

async function parseXlsxFile(buffer: Buffer): Promise<RawRow[]> {
  const workbook = new Workbook()
  // Cast: exceljs' own @types/node pins Buffer<ArrayBuffer> while ours is Buffer<ArrayBufferLike>
  type ExcelBuffer = Parameters<typeof workbook.xlsx.load>[0]
  await workbook.xlsx.load(buffer as unknown as ExcelBuffer)
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new BadRequestException('ไม่พบข้อมูลในไฟล์')

  const header = (sheet.getRow(1).values as unknown[]).slice(1).map(cellToText)
  const missing = REQUIRED_COLUMNS.filter((column) => !header.includes(column))
  if (missing.length > 0) throw new BadRequestException(MISSING_COLUMNS_MESSAGE(missing))

  const rows: RawRow[] = []
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const cells = (sheet.getRow(rowNumber).values as unknown[]).slice(1)
    rows.push({ rowNumber, values: recordToValues(header, cells.map(cellToText)) })
  }
  return rows
}

function recordToValues(header: string[], record: ArrayLike<string>): Record<string, string> {
  const values: Record<string, string> = {}
  header.forEach((column, index) => {
    if (column !== '') values[column] = record[index] ?? ''
  })
  return values
}

/** Normalizes an XLSX cell to text: Dates become YYYY-MM-DD, numbers become strings. */
function cellToText(cell: unknown): string {
  if (cell === null || cell === undefined) return ''
  if (cell instanceof Date) return cell.toISOString().slice(0, 10)
  if (typeof cell === 'object') {
    const object = cell as { result?: unknown; text?: unknown; richText?: { text: string }[] }
    if (object.richText) return object.richText.map((part) => part.text).join('')
    if (object.result !== undefined) return cellToText(object.result)
    if (object.text !== undefined) return String(object.text)
  }
  return String(cell).trim()
}

// --- row validation (spec §47) ----------------------------------------------

interface ValidStudentRow {
  studentCode: string
  firstName: string
  lastName: string
  birthDate: Date
  year: number
  email?: string
}

interface RowValidation {
  rowNumber: number
  studentCode: string
  valid: boolean
  errors: string[]
  data?: ValidStudentRow
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validateRow(row: RawRow, allRows: RawRow[]): RowValidation {
  const values = row.values
  const studentCode = values.student_code ?? ''
  const errors: string[] = []

  if (!studentCode) errors.push('ต้องระบุรหัสนักศึกษา')
  else if (!STUDENT_CODE_RE.test(studentCode)) errors.push('รหัสนักศึกษาต้องเป็นตัวเลข 12 หลัก')
  else {
    const duplicate = allRows.find((other) => other !== row && other.values.student_code === studentCode)
    if (duplicate) errors.push(`รหัสนักศึกษาซ้ำกับแถวที่ ${duplicate.rowNumber} ในไฟล์`)
  }

  const firstName = values.first_name ?? ''
  if (!firstName) errors.push('ต้องระบุชื่อจริง')

  const lastName = values.last_name ?? ''
  if (!lastName) errors.push('ต้องระบุนามสกุล')

  const birthDateText = values.birth_date ?? ''
  let birthDate: Date | null = null
  if (!birthDateText) errors.push('ต้องระบุวันเกิด (YYYY-MM-DD)')
  else {
    birthDate = parseBirthDate(birthDateText)
    if (!birthDate) errors.push('วันเกิดต้องเป็นวันที่รูปแบบ YYYY-MM-DD และอยู่ระหว่างปี 1900 ถึงปัจจุบัน')
  }

  const yearText = values.year ?? ''
  let year = 0
  if (!yearText) errors.push('ต้องระบุชั้นปี')
  else if (/^\d+$/.test(yearText)) {
    year = Number(yearText)
    if (year < 1 || year > 8) errors.push('ชั้นปีต้องเป็นตัวเลข 1 ถึง 8')
  } else {
    errors.push('ชั้นปีต้องเป็นตัวเลข 1 ถึง 8')
  }

  const email = values.email || undefined
  if (email && !EMAIL_RE.test(email)) errors.push('รูปแบบอีเมลไม่ถูกต้อง')

  if (errors.length > 0 || !birthDate) return { rowNumber: row.rowNumber, studentCode, valid: false, errors }

  return {
    rowNumber: row.rowNumber,
    studentCode,
    valid: true,
    errors: [],
    data: { studentCode, firstName, lastName, birthDate, year, email },
  }
}

// --- response shapes ---------------------------------------------------------

export interface ImportRowResult {
  /** Spreadsheet row number (header = row 1, first data row = row 2). */
  row: number
  studentCode: string
  status: 'valid' | 'error'
  errors: string[]
}

export interface ImportPreviewResult {
  totalRows: number
  validRows: number
  errorRows: number
  rows: ImportRowResult[]
}

export interface ImportApplyResult {
  created: number
  updated: number
  errorRows: number
  errors: ImportRowResult[]
}

function toRowResult(row: RowValidation): ImportRowResult {
  return { row: row.rowNumber, studentCode: row.studentCode, status: row.valid ? 'valid' : 'error', errors: row.errors }
}
