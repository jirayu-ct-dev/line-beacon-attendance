import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { Workbook } from 'exceljs'
import { AppModule } from '../../app.module'
import { configureApp } from '../../app.setup'
import { UserRole } from '../../generated/prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { createTestUser, deleteTestUser, TestUser } from '../../test/test-users'

const CODE_PREFIX = '669957'
const code = (n: number) => `${CODE_PREFIX}${String(n).padStart(6, '0')}`
const HWID = 'rpt0123456'
const NAME_PREFIX = 'ITEST-RPT-'

const ADMIN = { email: 'itest-rpt-admin@example.com', username: 'itest-rpt-admin', password: 'itest-pw-1' }
const ORG1 = { email: 'itest-rpt-org1@example.com', username: 'itest-rpt-org1', password: 'itest-pw-1' }
const ORG2 = { email: 'itest-rpt-org2@example.com', username: 'itest-rpt-org2', password: 'itest-pw-1' }

describe('Reports (integration)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let admin: TestUser
  let org1: TestUser
  let org2: TestUser
  let student1: { id: string }
  let student3: { id: string }
  let activityId: string

  const server = () => app.getHttpServer()

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    configureApp(app)
    await app.init()
    prisma = app.get(PrismaService)

    await cleanup()
    admin = await createTestUser(app, prisma, { ...ADMIN, role: UserRole.ADMIN })
    org1 = await createTestUser(app, prisma, { ...ORG1, role: UserRole.ORGANIZER })
    org2 = await createTestUser(app, prisma, { ...ORG2, role: UserRole.ORGANIZER })

    // 3 ACTIVE students get the rows; the 4th is INACTIVE and must not be counted (§44)
    for (const n of [1, 2, 3, 4]) {
      const student = await prisma.student.create({
        data: {
          studentCode: code(n),
          firstName: 'Rpt',
          lastName: `Test${n}`,
          birthDate: new Date('2004-01-01'),
          year: 2,
          ...(n === 4 && { status: 'INACTIVE' }),
        },
        select: { id: true },
      })
      if (n === 1) student1 = student
      if (n === 3) student3 = student
    }
    const beacon = await prisma.beacon.create({ data: { hwid: HWID, name: 'Rpt Beacon' }, select: { id: true } })
    const activity = await prisma.activity.create({
      data: {
        name: `${NAME_PREFIX}Workshop, ภาคต้น`,
        createdBy: org1.id,
        status: 'PUBLISHED',
        checkinOpenAt: new Date('2025-08-22T07:00:00Z'),
        lateAt: new Date('2025-08-22T08:10:00Z'),
        checkinCloseAt: new Date('2025-08-22T08:30:00Z'),
        startAt: new Date('2025-08-22T08:00:00Z'),
        endAt: new Date('2025-08-22T10:00:00Z'),
      },
      select: { id: true },
    })
    activityId = activity.id
    await prisma.activityBeacon.create({ data: { activityId, beaconId: beacon.id } })

    await prisma.attendance.create({
      data: { activityId, studentId: student1.id, checkInAt: new Date('2025-08-22T08:05:00Z'), status: 'PRESENT', checkinMethod: 'BEACON', beaconId: beacon.id },
    })
    await prisma.attendance.create({
      data: { activityId, studentId: (await prisma.student.findUniqueOrThrow({ where: { studentCode: code(2) }, select: { id: true } })).id, checkInAt: new Date('2025-08-22T08:20:00Z'), status: 'LATE', checkinMethod: 'BEACON', beaconId: beacon.id },
    })
    await prisma.attendance.create({
      data: { activityId, studentId: student3.id, checkInAt: new Date('2025-08-22T09:00:00Z'), status: 'EXCUSED', checkinMethod: 'MANUAL', checkedInBy: org1.id, manualReason: 'ลาแข่งกีฬา' },
    })
  })

  async function cleanup(): Promise<void> {
    await prisma.attendance.deleteMany({
      where: { OR: [{ activity: { name: { startsWith: NAME_PREFIX } } }, { student: { studentCode: { startsWith: CODE_PREFIX } } }] },
    })
    await prisma.activityBeacon.deleteMany({
      where: { OR: [{ beacon: { hwid: HWID } }, { activity: { name: { startsWith: NAME_PREFIX } } }] },
    })
    await prisma.activity.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } })
    await prisma.beacon.deleteMany({ where: { hwid: HWID } })
    await prisma.student.deleteMany({ where: { studentCode: { startsWith: CODE_PREFIX } } })
    for (const user of [ADMIN, ORG1, ORG2]) await deleteTestUser(prisma, user.email)
  }

  afterAll(async () => {
    await cleanup()
    await app.close()
  })

  // --- activity report (spec §44) -------------------------------------------------

  it('GET /reports/activities/:id (owner) → header + §44 counts + full list', async () => {
    const res = await request(server()).get(`/api/v1/reports/activities/${activityId}`).set('Cookie', org1.cookie).expect(200)

    const activeStudents = await prisma.student.count({ where: { status: 'ACTIVE' } })
    expect(res.body.data.activity).toMatchObject({ name: `${NAME_PREFIX}Workshop, ภาคต้น`, organizer: { username: ORG1.username } })
    expect(res.body.data.summary).toMatchObject({ totalStudents: activeStudents, present: 1, late: 1, excused: 1 })
    expect(res.body.data.summary.absent).toBe(Math.max(activeStudents - 3, 0))

    const rows = res.body.data.attendances
    expect(rows).toHaveLength(3)
    // Sorted by student code ascending; ABSENT rows never exist (§44)
    expect(rows.map((row: { student: { studentCode: string } }) => row.student.studentCode)).toEqual([code(1), code(2), code(3)])
    expect(rows[2]).toMatchObject({ status: 'EXCUSED', checkinMethod: 'MANUAL', manualReason: 'ลาแข่งกีฬา', checkedInBy: { username: ORG1.username } })
    expect(rows[0]).toMatchObject({ status: 'PRESENT', checkinMethod: 'BEACON', beacon: { hwid: HWID } })
  })

  it('GET /reports/activities/:id (admin) → 200; outsider organizer → 403; unknown → 404', async () => {
    await request(server()).get(`/api/v1/reports/activities/${activityId}`).set('Cookie', admin.cookie).expect(200)

    const forbidden = await request(server()).get(`/api/v1/reports/activities/${activityId}`).set('Cookie', org2.cookie).expect(403)
    expect(forbidden.body.error.code).toBe('FORBIDDEN')

    const missing = await request(server()).get('/api/v1/reports/activities/does-not-exist').set('Cookie', admin.cookie).expect(404)
    expect(missing.body.error.code).toBe('NOT_FOUND')
  })

  // --- export (spec §44 CSV + Excel) ------------------------------------------------

  it('GET /reports/activities/:id/export (default csv) → UTF-8 BOM CSV with summary + list', async () => {
    const res = await request(server())
      .get(`/api/v1/reports/activities/${activityId}/export`)
      .set('Cookie', org1.cookie)
      .expect(200)
      .expect('Content-Type', /text\/csv/)
      .expect('Content-Disposition', /attachment; filename=/)

    // UTF-8 form of the Thai filename (RFC 5987)
    expect(res.headers['content-disposition']).toContain(encodeURIComponent(`${NAME_PREFIX}Workshop, ภาคต้น.csv`))

    const text = res.text as string
    expect(text.startsWith('\uFEFFรายงานการเช็คชื่อกิจกรรม')).toBe(true)
    expect(text).toContain('รหัสนักศึกษา')
    expect(text).toContain('เข้าร่วม,1')
    expect(text).toContain('มาสาย,1')
    // The quoted activity name (it contains a comma) survives CSV escaping
    expect(text).toContain(`"${NAME_PREFIX}Workshop, ภาคต้น"`)
    for (const n of [1, 2, 3]) expect(text).toContain(code(n))
    expect(text).toContain('ลาแข่งกีฬา')
    // 9 summary lines + blank + header + 3 data rows
    expect(text.trimEnd().split('\r\n')).toHaveLength(14)
  })

  it('GET /reports/activities/:id/export?format=xlsx → valid Excel workbook', async () => {
    const res = await request(server())
      .get(`/api/v1/reports/activities/${activityId}/export`)
      .query({ format: 'xlsx' })
      .set('Cookie', org1.cookie)
      // superagent has no built-in parser for the xlsx content type — collect
      // the raw bytes ourselves so res.body is a Buffer.
      .buffer()
      .parse((res, callback) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => callback(null, Buffer.concat(chunks)))
      })
      .expect(200)
      .expect('Content-Type', /spreadsheetml/)

    const body = res.body as Buffer
    expect(body.slice(0, 2).toString('utf8')).toBe('PK')

    const workbook = new Workbook()
    // Same cast as the students import path (exceljs pins its own Buffer type)
    await workbook.xlsx.load(body as unknown as Parameters<typeof workbook.xlsx.load>[0])
    const sheet = workbook.getWorksheet('รายงาน')
    expect(sheet).toBeDefined()

    const rows: unknown[][] = []
    sheet!.eachRow((row) => rows.push((row.values as unknown[]).slice(1)))
    expect(rows.some((values) => values[0] === 'ชื่อกิจกรรม' && values[1] === `${NAME_PREFIX}Workshop, ภาคต้น`)).toBe(true)
    expect(rows.some((values) => values[0] === 'เข้าร่วม' && values[1] === 1)).toBe(true)
    expect(rows.some((values) => values[0] === 'รหัสนักศึกษา')).toBe(true)
    expect(rows.some((values) => values[0] === code(1) && values[3] === 'เข้าร่วม' && values[5] === HWID)).toBe(true)
    expect(rows.some((values) => values[0] === code(3) && values[3] === 'ลา' && values[4] === 'เช็คชื่อแทน' && values[7] === 'ลาแข่งกีฬา')).toBe(true)
  })

  it('GET /reports/activities/:id/export?format=pdf → 400; outsider → 403', async () => {
    const bad = await request(server())
      .get(`/api/v1/reports/activities/${activityId}/export`)
      .query({ format: 'pdf' })
      .set('Cookie', admin.cookie)
      .expect(400)
    expect(bad.body.error.code).toBe('VALIDATION_ERROR')

    await request(server())
      .get(`/api/v1/reports/activities/${activityId}/export`)
      .set('Cookie', org2.cookie)
      .expect(403)
  })

  // --- student report (spec §35) ---------------------------------------------------

  it('GET /reports/students/:id (admin) → header + counts + history', async () => {
    const res = await request(server()).get(`/api/v1/reports/students/${student1.id}`).set('Cookie', admin.cookie).expect(200)

    expect(res.body.data.student).toMatchObject({ studentCode: code(1), name: 'Rpt Test1', status: 'ACTIVE' })
    expect(res.body.data.summary).toEqual({ total: 1, present: 1, late: 0, excused: 0 })
    expect(res.body.data.attendances).toHaveLength(1)
    expect(res.body.data.attendances[0]).toMatchObject({ activityId, activityName: `${NAME_PREFIX}Workshop, ภาคต้น`, status: 'PRESENT' })
  })

  it('GET /reports/students/:id — organizer forbidden, unknown student 404', async () => {
    const forbidden = await request(server()).get(`/api/v1/reports/students/${student1.id}`).set('Cookie', org1.cookie).expect(403)
    expect(forbidden.body.error.code).toBe('FORBIDDEN')

    const missing = await request(server()).get('/api/v1/reports/students/does-not-exist').set('Cookie', admin.cookie).expect(404)
    expect(missing.body.error.code).toBe('NOT_FOUND')
  })
})
