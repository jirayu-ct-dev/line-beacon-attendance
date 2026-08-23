import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../../app.module'
import { configureApp } from '../../app.setup'
import { UserRole } from '../../generated/prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { createTestUser, deleteTestUser, TestUser } from '../../test/test-users'

const CODE_PREFIX = '669955'
const code = (n: number) => `${CODE_PREFIX}${String(n).padStart(6, '0')}`
const HWID = 'abba123456'
const NAME_PREFIX = 'ITEST-ATT-'

const ADMIN = { email: 'itest-att-admin@example.com', username: 'itest-att-admin', password: 'itest-pw-1' }
const ORG1 = { email: 'itest-att-org1@example.com', username: 'itest-att-org1', password: 'itest-pw-1' }
const ORG2 = { email: 'itest-att-org2@example.com', username: 'itest-att-org2', password: 'itest-pw-1' }

describe('Attendance (integration)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let admin: TestUser
  let org1: TestUser
  let org2: TestUser
  let student1: { id: string }
  let student2: { id: string }
  let beaconId: string
  let activityId: string
  let manualAttendanceId: string
  let beaconAttendanceId: string

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

    for (const n of [1, 2]) {
      const student = await prisma.student.create({
        data: {
          studentCode: code(n),
          firstName: n === 1 ? 'Manao' : 'Mamuang',
          lastName: 'Test',
          birthDate: new Date('2004-01-01'),
          year: 2,
        },
        select: { id: true },
      })
      if (n === 1) student1 = student
      else student2 = student
    }
    const beacon = await prisma.beacon.create({ data: { hwid: HWID, name: 'Att Beacon' }, select: { id: true } })
    beaconId = beacon.id
    // Window in the past — manual check-in must still work (spec §19/§55)
    const activity = await prisma.activity.create({
      data: {
        name: `${NAME_PREFIX}Workshop`,
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
    await prisma.activityBeacon.create({ data: { activityId, beaconId } })

    // One manual row (created via the API in the first test) placeholder ids;
    // one BEACON row seeded directly for list/patch coverage.
    const seeded = await prisma.attendance.create({
      data: {
        activityId,
        studentId: student2.id,
        checkInAt: new Date('2025-08-22T08:05:00Z'),
        status: 'PRESENT',
        checkinMethod: 'BEACON',
        beaconId,
      },
      select: { id: true },
    })
    beaconAttendanceId = seeded.id
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

  // --- manual check-in (spec §19) ------------------------------------------------

  it('POST manual check-in (activity owner, outside the window) → MANUAL row + audit', async () => {
    const res = await request(server())
      .post(`/api/v1/activities/${activityId}/attendances/manual`)
      .set('Cookie', org1.cookie)
      .send({ studentId: student1.id, status: 'EXCUSED', manualReason: 'ลากิจ' })
      .expect(201)
    expect(res.body.data).toMatchObject({
      student: { studentCode: code(1), name: 'Manao Test' },
      status: 'EXCUSED',
      checkinMethod: 'MANUAL',
      beacon: null,
      checkedInBy: { username: ORG1.username },
      manualReason: 'ลากิจ',
    })
    manualAttendanceId = res.body.data.id

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'ATTENDANCE_MANUAL_CREATED', entityId: manualAttendanceId, userId: org1.id },
    })
    expect(audit?.newValue).toMatchObject({ status: 'EXCUSED', manual_reason: 'ลากิจ' })
  })

  it('duplicate manual check-in → 409; invalid status/missing reason → 400; unknown student → 404', async () => {
    const dup = await request(server())
      .post(`/api/v1/activities/${activityId}/attendances/manual`)
      .set('Cookie', org1.cookie)
      .send({ studentId: student1.id, status: 'PRESENT', manualReason: 'again' })
      .expect(409)
    expect(dup.body).toEqual({ success: false, error: { code: 'CONFLICT', message: expect.any(String) } })

    for (const body of [
      { studentId: student2.id, status: 'ABSENT', manualReason: 'x' }, // ABSENT is computed, not stored
      { studentId: student2.id, status: 'PRESENT' }, // missing reason
    ]) {
      await request(server())
        .post(`/api/v1/activities/${activityId}/attendances/manual`)
        .set('Cookie', org1.cookie)
        .send(body)
        .expect(400)
    }

    await request(server())
      .post(`/api/v1/activities/${activityId}/attendances/manual`)
      .set('Cookie', org1.cookie)
      .send({ studentId: 'no-such-student', status: 'PRESENT', manualReason: 'x' })
      .expect(404)
  })

  it('another organizer → 403 on every attendance route of this activity', async () => {
    // Bodies must be valid so the global ValidationPipe does not answer 400
    // before the ownership check in the service runs.
    const validBodies: Record<string, object> = {
      post: { studentId: student2.id, status: 'PRESENT', manualReason: 'x' },
      patch: { status: 'LATE' },
    }
    for (const [method, path] of [
      ['get', `/api/v1/activities/${activityId}/attendances`],
      ['post', `/api/v1/activities/${activityId}/attendances/manual`],
      ['patch', `/api/v1/activities/${activityId}/attendances/${beaconAttendanceId}`],
    ] as const) {
      const res = await request(server())[method](path).set('Cookie', org2.cookie).send(validBodies[method]).expect(403)
      expect(res.body.error.code).toBe('FORBIDDEN')
    }
  })

  // --- list (spec §25, §46) --------------------------------------------------------

  it('GET /activities/:id/attendances — envelope, row shape, search + status/method filters', async () => {
    const res = await request(server())
      .get(`/api/v1/activities/${activityId}/attendances`)
      .set('Cookie', org1.cookie)
      .expect(200)
    expect(res.body.data.total).toBe(2)
    const beaconRow = res.body.data.items.find((r: { id: string }) => r.id === beaconAttendanceId)
    expect(beaconRow).toMatchObject({
      student: { studentCode: code(2) },
      status: 'PRESENT',
      checkinMethod: 'BEACON',
      beacon: { hwid: HWID },
      checkedInBy: null,
      checkInAt: '2025-08-22T08:05:00.000Z',
    })

    // admin sees the same list (§29 full access)
    await request(server()).get(`/api/v1/activities/${activityId}/attendances`).set('Cookie', admin.cookie).expect(200)

    const byMethod = await request(server())
      .get(`/api/v1/activities/${activityId}/attendances?method=MANUAL`)
      .set('Cookie', org1.cookie)
      .expect(200)
    expect(byMethod.body.data.total).toBe(1)
    expect(byMethod.body.data.items[0].student.studentCode).toBe(code(1))

    const byStatus = await request(server())
      .get(`/api/v1/activities/${activityId}/attendances?status=EXCUSED`)
      .set('Cookie', org1.cookie)
      .expect(200)
    expect(byStatus.body.data.total).toBe(1)

    const bySearch = await request(server())
      .get(`/api/v1/activities/${activityId}/attendances?search=mamuang`)
      .set('Cookie', org1.cookie)
      .expect(200)
    expect(bySearch.body.data.total).toBe(1)
    expect(bySearch.body.data.items[0].student.studentCode).toBe(code(2))

    const badSort = await request(server())
      .get(`/api/v1/activities/${activityId}/attendances?sort=password`)
      .set('Cookie', org1.cookie)
      .expect(400)
    expect(badSort.body.error.code).toBe('VALIDATION_ERROR')
  })

  // --- manual status change (spec §19/§31, §56.11) ---------------------------------

  it('PATCH attendance status → updated + ATTENDANCE_UPDATED audit; same-status PATCH is a no-op', async () => {
    const before = await prisma.auditLog.count({ where: { entityId: manualAttendanceId } })

    const res = await request(server())
      .patch(`/api/v1/activities/${activityId}/attendances/${manualAttendanceId}`)
      .set('Cookie', org1.cookie)
      .send({ status: 'PRESENT' })
      .expect(200)
    expect(res.body.data.status).toBe('PRESENT')

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'ATTENDANCE_UPDATED', entityId: manualAttendanceId },
    })
    expect(audit?.oldValue).toMatchObject({ status: 'EXCUSED' })
    expect(audit?.newValue).toMatchObject({ status: 'PRESENT' })

    // re-applying the same status writes no extra audit row
    await request(server())
      .patch(`/api/v1/activities/${activityId}/attendances/${manualAttendanceId}`)
      .set('Cookie', org1.cookie)
      .send({ status: 'PRESENT' })
      .expect(200)
    expect(await prisma.auditLog.count({ where: { entityId: manualAttendanceId } })).toBe(before + 1)

    await request(server())
      .patch(`/api/v1/activities/${activityId}/attendances/no-such-id`)
      .set('Cookie', org1.cookie)
      .send({ status: 'LATE' })
      .expect(404)
  })

  // --- per-student history (spec §35) ----------------------------------------------

  it('GET /students/:id/attendances — admin sees history with activity names; organizer → 403', async () => {
    const res = await request(server())
      .get(`/api/v1/students/${student1.id}/attendances`)
      .set('Cookie', admin.cookie)
      .expect(200)
    expect(res.body.data.total).toBe(1)
    expect(res.body.data.items[0]).toMatchObject({
      activityId,
      activityName: `${NAME_PREFIX}Workshop`,
      status: 'PRESENT',
      checkinMethod: 'MANUAL',
      checkedInBy: { username: ORG1.username },
    })

    await request(server()).get(`/api/v1/students/${student1.id}/attendances`).set('Cookie', org1.cookie).expect(403)
    await request(server()).get(`/api/v1/students/no-such-id/attendances`).set('Cookie', admin.cookie).expect(404)
  })
})
