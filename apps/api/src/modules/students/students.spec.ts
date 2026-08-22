import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { Workbook } from 'exceljs'
import { AppModule } from '../../app.module'
import { configureApp } from '../../app.setup'
import { UserRole } from '../../generated/prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { createTestUser, deleteTestUser, TestUser } from '../../test/test-users'

// All student codes created by this spec share this 12-digit prefix.
const CODE_PREFIX = '660999'
const code = (n: number) => `${CODE_PREFIX}${String(n).padStart(6, '0')}` // e.g. 660999000001

const ADMIN = { email: 'itest-students-admin@example.com', username: 'itest-students-admin', password: 'itest-pw-1' }
const ORGANIZER = { email: 'itest-students-org@example.com', username: 'itest-students-org', password: 'itest-pw-1' }

function csv(rows: string[][]): Buffer {
  return Buffer.from(rows.map((row) => row.join(',')).join('\n'), 'utf8')
}

describe('Students (integration)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let admin: TestUser
  let organizer: TestUser

  const server = () => app.getHttpServer()

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    configureApp(app)
    await app.init()
    prisma = app.get(PrismaService)

    await prisma.student.deleteMany({ where: { studentCode: { startsWith: CODE_PREFIX } } })
    await deleteTestUser(prisma, ADMIN.email)
    await deleteTestUser(prisma, ORGANIZER.email)
    admin = await createTestUser(app, prisma, { ...ADMIN, role: UserRole.ADMIN })
    organizer = await createTestUser(app, prisma, { ...ORGANIZER, role: UserRole.ORGANIZER })

    // Staggered createdAt: createMany in one statement would give identical
    // timestamps, making the default newest-first ordering ambiguous.
    await prisma.student.create({
      data: {
        studentCode: code(1),
        firstName: 'Somchai',
        lastName: 'Jaidee',
        birthDate: new Date('2004-01-01'),
        year: 3,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    })
    await prisma.student.create({
      data: {
        studentCode: code(2),
        firstName: 'Somsri',
        lastName: 'Deemak',
        birthDate: new Date('2005-02-14'),
        year: 2,
        createdAt: new Date('2026-01-02T00:00:00Z'),
      },
    })
    await prisma.student.create({
      data: {
        studentCode: code(3),
        firstName: 'Anucha',
        lastName: 'Wong',
        birthDate: new Date('2003-03-03'),
        year: 3,
        status: 'INACTIVE',
        createdAt: new Date('2026-01-03T00:00:00Z'),
      },
    })
  })

  afterAll(async () => {
    await prisma.student.deleteMany({ where: { studentCode: { startsWith: CODE_PREFIX } } })
    await deleteTestUser(prisma, ADMIN.email)
    await deleteTestUser(prisma, ORGANIZER.email)
    await app.close()
  })

  // --- list (pagination / search / filter, spec §35, §46) --------------------

  it('GET /students returns the paginated envelope (newest first by default)', async () => {
    const res = await request(server()).get('/api/v1/students').set('Cookie', admin.cookie).expect(200)
    expect(res.body.success).toBe(true)
    const data = res.body.data
    expect(data.total).toBe(3)
    expect(data.page).toBe(1)
    expect(data.pageSize).toBe(20)
    expect(data.items).toHaveLength(3)
    expect(data.items.map((s: { studentCode: string }) => s.studentCode)).toEqual([code(3), code(2), code(1)])
    expect(data.items[0]).toMatchObject({
      id: expect.any(String),
      studentCode: code(3),
      firstName: 'Anucha',
      birthDate: '2003-03-03',
      status: 'INACTIVE',
      lineLinked: false,
    })
  })

  it('GET /students pagination — pageSize=2 page=2 returns the remaining item', async () => {
    const res = await request(server())
      .get('/api/v1/students?page=2&pageSize=2')
      .set('Cookie', admin.cookie)
      .expect(200)
    expect(res.body.data).toMatchObject({ total: 3, page: 2, pageSize: 2 })
    expect(res.body.data.items).toHaveLength(1)
  })

  it('GET /students search matches code/first/last name case-insensitively', async () => {
    const byName = await request(server())
      .get('/api/v1/students?search=somchai')
      .set('Cookie', admin.cookie)
      .expect(200)
    expect(byName.body.data.total).toBe(1)
    expect(byName.body.data.items[0].studentCode).toBe(code(1))

    const byCodePart = await request(server())
      .get('/api/v1/students?search=000002')
      .set('Cookie', admin.cookie)
      .expect(200)
    expect(byCodePart.body.data.total).toBe(1)
    expect(byCodePart.body.data.items[0].firstName).toBe('Somsri')

    const byLastName = await request(server())
      .get('/api/v1/students?search=DEEMAK')
      .set('Cookie', admin.cookie)
      .expect(200)
    expect(byLastName.body.data.total).toBe(1)
  })

  it('GET /students filters by status and year, and rejects unknown sort fields', async () => {
    const res = await request(server())
      .get('/api/v1/students?status=ACTIVE&year=3')
      .set('Cookie', admin.cookie)
      .expect(200)
    expect(res.body.data.total).toBe(1)
    expect(res.body.data.items[0].studentCode).toBe(code(1))

    const badSort = await request(server())
      .get('/api/v1/students?sort=password')
      .set('Cookie', admin.cookie)
      .expect(400)
    expect(badSort.body.error.code).toBe('VALIDATION_ERROR')
  })

  // --- create (spec §47) ------------------------------------------------------

  it('POST /students with a non-12-digit code → 400 VALIDATION_ERROR', async () => {
    for (const studentCode of ['66011223003', '66011223003x', 'abc']) {
      const res = await request(server())
        .post('/api/v1/students')
        .set('Cookie', admin.cookie)
        .send({ studentCode, firstName: 'A', lastName: 'B', birthDate: '2004-01-01', year: 3 })
        .expect(400)
      expect(res.body).toEqual({ success: false, error: { code: 'VALIDATION_ERROR', message: expect.any(String) } })
    }
  })

  it('POST /students with an out-of-range birth date or year → 400 VALIDATION_ERROR', async () => {
    for (const body of [
      { studentCode: code(10), firstName: 'A', lastName: 'B', birthDate: '1899-12-31', year: 3 },
      { studentCode: code(10), firstName: 'A', lastName: 'B', birthDate: '2099-01-01', year: 3 },
      { studentCode: code(10), firstName: 'A', lastName: 'B', birthDate: '2004-02-30', year: 3 },
      { studentCode: code(10), firstName: 'A', lastName: 'B', birthDate: '2004-01-01', year: 9 },
    ]) {
      await request(server()).post('/api/v1/students').set('Cookie', admin.cookie).send(body).expect(400)
    }
  })

  it('POST /students with a duplicate code → 409 CONFLICT envelope', async () => {
    const res = await request(server())
      .post('/api/v1/students')
      .set('Cookie', admin.cookie)
      .send({ studentCode: code(1), firstName: 'Dup', lastName: 'Dup', birthDate: '2004-01-01', year: 1 })
      .expect(409)
    expect(res.body).toEqual({ success: false, error: { code: 'CONFLICT', message: expect.any(String) } })
  })

  it('POST /students valid → 201, STUDENT_CREATED audit row written', async () => {
    const res = await request(server())
      .post('/api/v1/students')
      .set('Cookie', admin.cookie)
      .send({
        studentCode: code(11),
        firstName: 'Nattapong',
        lastName: 'Suk',
        birthDate: '2004-06-15',
        year: 2,
        email: 'nat@example.com',
      })
      .expect(201)
    expect(res.body.data).toMatchObject({ studentCode: code(11), status: 'ACTIVE', birthDate: '2004-06-15' })

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'STUDENT_CREATED', entityId: res.body.data.id, userId: admin.id },
    })
    expect(audit?.newValue).toMatchObject({ student_code: code(11), year: 2 })
  })

  // --- get / update -------------------------------------------------------------

  it('GET /students/:id unknown id → 404 NOT_FOUND envelope', async () => {
    const res = await request(server()).get('/api/v1/students/no-such-id').set('Cookie', admin.cookie).expect(404)
    expect(res.body).toEqual({ success: false, error: { code: 'NOT_FOUND', message: expect.any(String) } })
  })

  it('PATCH /students/:id updates fields, allows code change, writes STUDENT_UPDATED with old/new', async () => {
    const created = await request(server())
      .post('/api/v1/students')
      .set('Cookie', admin.cookie)
      .send({ studentCode: code(12), firstName: 'Old', lastName: 'Name', birthDate: '2004-01-01', year: 1 })
      .expect(201)

    const res = await request(server())
      .patch(`/api/v1/students/${created.body.data.id}`)
      .set('Cookie', admin.cookie)
      .send({ studentCode: code(13), firstName: 'New' })
      .expect(200)
    expect(res.body.data).toMatchObject({ studentCode: code(13), firstName: 'New', lastName: 'Name' })

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'STUDENT_UPDATED', entityId: created.body.data.id },
    })
    expect(audit?.oldValue).toMatchObject({ student_code: code(12), first_name: 'Old' })
    expect(audit?.newValue).toMatchObject({ student_code: code(13), first_name: 'New' })
  })

  it('PATCH /students/:id changing the code to an existing one → 409 CONFLICT', async () => {
    const created = await request(server())
      .post('/api/v1/students')
      .set('Cookie', admin.cookie)
      .send({ studentCode: code(14), firstName: 'X', lastName: 'Y', birthDate: '2004-01-01', year: 1 })
      .expect(201)

    await request(server())
      .patch(`/api/v1/students/${created.body.data.id}`)
      .set('Cookie', admin.cookie)
      .send({ studentCode: code(1) })
      .expect(409)
  })

  // --- disable / enable (spec §35 — no hard delete) ------------------------------

  it('disable → INACTIVE + STUDENT_DISABLED audit; enable → ACTIVE + STUDENT_ENABLED; idempotent re-disable writes no extra audit', async () => {
    const created = await request(server())
      .post('/api/v1/students')
      .set('Cookie', admin.cookie)
      .send({ studentCode: code(15), firstName: 'D', lastName: 'E', birthDate: '2004-01-01', year: 1 })
      .expect(201)
    const id = created.body.data.id

    const disabled = await request(server())
      .post(`/api/v1/students/${id}/disable`)
      .set('Cookie', admin.cookie)
      .expect(201)
    expect(disabled.body.data.status).toBe('INACTIVE')

    const enabled = await request(server()).post(`/api/v1/students/${id}/enable`).set('Cookie', admin.cookie).expect(201)
    expect(enabled.body.data.status).toBe('ACTIVE')

    await request(server()).post(`/api/v1/students/${id}/disable`).set('Cookie', admin.cookie).expect(201)
    await request(server()).post(`/api/v1/students/${id}/disable`).set('Cookie', admin.cookie).expect(201) // idempotent

    const actions = await prisma.auditLog.findMany({ where: { entityId: id }, orderBy: { createdAt: 'asc' } })
    expect(actions.map((a) => a.action)).toEqual(['STUDENT_CREATED', 'STUDENT_DISABLED', 'STUDENT_ENABLED', 'STUDENT_DISABLED'])
  })

  // --- import (spec §8) ------------------------------------------------------------

  it('POST /students/import/preview reports per-row errors without writing', async () => {
    const before = await prisma.student.count({ where: { studentCode: { startsWith: CODE_PREFIX } } })
    const file = csv([
      ['student_code', 'first_name', 'last_name', 'birth_date', 'year', 'email'],
      [code(21), 'Okay', 'Row', '2004-01-01', '3', ''],
      [code(22).slice(0, 11), 'Bad', 'Code', '2004-01-01', '3', ''], // 11 digits → invalid
      [code(23), 'Bad', 'Date', 'not-a-date', '3', ''],
      [code(24), 'Bad', 'Year', '2004-01-01', '9', ''],
      [code(24), 'Dup', 'InFile', '2004-01-01', '1', ''], // duplicate of previous row
    ])

    const res = await request(server())
      .post('/api/v1/students/import/preview')
      .set('Cookie', admin.cookie)
      .attach('file', file, 'students.csv')
      .expect(201)
    expect(res.body.data).toMatchObject({ totalRows: 5, validRows: 1, errorRows: 4 })
    const resultRows = res.body.data.rows as { row: number; studentCode: string; status: string; errors: string[] }[]
    expect(resultRows[0]).toEqual({ row: 2, studentCode: code(21), status: 'valid', errors: [] })
    expect(resultRows[1].row).toBe(3)
    expect(resultRows[1].errors[0]).toContain('12 หลัก')
    expect(resultRows[2].errors.join()).toContain('วันเกิด')
    expect(resultRows[4].errors.join()).toContain('ซ้ำ')

    const after = await prisma.student.count({ where: { studentCode: { startsWith: CODE_PREFIX } } })
    expect(after).toBe(before) // preview never writes
  })

  it('POST /students/import/preview with a wrong header → 400 listing missing columns', async () => {
    const file = csv([
      ['student_code', 'first_name', 'last_name', 'year'],
      [code(21), 'A', 'B', '3'],
    ])
    const res = await request(server())
      .post('/api/v1/students/import/preview')
      .set('Cookie', admin.cookie)
      .attach('file', file, 'students.csv')
      .expect(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(res.body.error.message).toContain('birth_date')
  })

  it('POST /students/import/preview rejects unsupported files and >1000 rows', async () => {
    const badExt = await request(server())
      .post('/api/v1/students/import/preview')
      .set('Cookie', admin.cookie)
      .attach('file', Buffer.from('hello'), 'students.txt')
      .expect(400)
    expect(badExt.body.error.code).toBe('VALIDATION_ERROR')

    const tooMany = [['student_code', 'first_name', 'last_name', 'birth_date', 'year']]
    for (let i = 0; i < 1001; i++) {
      tooMany.push([`${CODE_PREFIX}${String(50 + i).padStart(6, '0')}`, 'A', 'B', '2004-01-01', '1'])
    }
    const res = await request(server())
      .post('/api/v1/students/import/preview')
      .set('Cookie', admin.cookie)
      .attach('file', csv(tooMany), 'students.csv')
      .expect(400)
    expect(res.body.error.message).toContain('1000')
  })

  it('POST /students/import applies valid rows with upsert semantics, preserves status, audits STUDENT_IMPORTED', async () => {
    // student 1 exists (ACTIVE); disable it first to prove import does not touch status
    const existing = await prisma.student.findUnique({ where: { studentCode: code(1) } })
    await request(server()).post(`/api/v1/students/${existing!.id}/disable`).set('Cookie', admin.cookie).expect(201)

    const file = csv([
      ['student_code', 'first_name', 'last_name', 'birth_date', 'year', 'email'],
      [code(1), 'Somchai-Updated', 'Jaidee', '2004-01-01', '3', 'somchai@example.com'], // existing → update
      [code(30), 'New', 'Import', '2006-07-07', '1', ''], // new → create
      ['123', 'Broken', 'Row', '2004-01-01', '1', ''], // invalid → skipped
    ])
    const res = await request(server())
      .post('/api/v1/students/import')
      .set('Cookie', admin.cookie)
      .attach('file', file, 'students.csv')
      .expect(201)
    expect(res.body.data).toMatchObject({ created: 1, updated: 1, errorRows: 1 })
    expect(res.body.data.errors[0]).toMatchObject({ row: 4, status: 'error' })

    const updated = await prisma.student.findUnique({ where: { studentCode: code(1) } })
    expect(updated?.firstName).toBe('Somchai-Updated')
    expect(updated?.status).toBe('INACTIVE') // import must not resurrect a disabled student
    const created = await prisma.student.findUnique({ where: { studentCode: code(30) } })
    expect(created).not.toBeNull()

    const audit = await prisma.auditLog.findFirst({ where: { action: 'STUDENT_IMPORTED', userId: admin.id } })
    expect(audit?.newValue).toMatchObject({ created: 1, updated: 1, error_rows: 1 })
  })

  it('POST /students/import handles XLSX files (exceljs path)', async () => {
    const workbook = new Workbook()
    const sheet = workbook.addWorksheet('students')
    sheet.addRow(['student_code', 'first_name', 'last_name', 'birth_date', 'year', 'email'])
    sheet.addRow([code(31), 'Excel', 'Row', '2004-01-01', 2, 'excel@example.com'])
    const buffer = await workbook.xlsx.writeBuffer()

    const preview = await request(server())
      .post('/api/v1/students/import/preview')
      .set('Cookie', admin.cookie)
      .attach('file', Buffer.from(buffer), 'students.xlsx')
      .expect(201)
    expect(preview.body.data).toMatchObject({ totalRows: 1, validRows: 1, errorRows: 0 })

    const applied = await request(server())
      .post('/api/v1/students/import')
      .set('Cookie', admin.cookie)
      .attach('file', Buffer.from(buffer), 'students.xlsx')
      .expect(201)
    expect(applied.body.data).toMatchObject({ created: 1, updated: 0, errorRows: 0 })
    expect(await prisma.student.findUnique({ where: { studentCode: code(31) } })).not.toBeNull()
  })

  // --- access control (spec §29) -----------------------------------------------------

  it('organizer (non-admin) → 403 FORBIDDEN envelope on every students route', async () => {
    for (const [method, path] of [
      ['get', '/api/v1/students'],
      ['post', '/api/v1/students'],
      ['post', '/api/v1/students/some-id/disable'],
    ] as const) {
      const res = await request(server())[method](path).set('Cookie', organizer.cookie).expect(403)
      expect(res.body).toEqual({ success: false, error: { code: 'FORBIDDEN', message: expect.any(String) } })
    }
  })

  it('unauthenticated → 401 envelope', async () => {
    const res = await request(server()).get('/api/v1/students').expect(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })
})
