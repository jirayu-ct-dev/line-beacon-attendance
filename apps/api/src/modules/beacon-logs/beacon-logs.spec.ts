import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../../app.module'
import { configureApp } from '../../app.setup'
import { UserRole } from '../../generated/prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { createTestUser, deleteTestUser, TestUser } from '../../test/test-users'

// All rows created by this spec share these prefixes.
const CODE_PREFIX = '669888'
const code = (n: number) => `${CODE_PREFIX}${String(n).padStart(6, '0')}` // e.g. 669888000001
const HWID_PREFIX = 'feed' // hex chars; hwid = prefix + 6 digits
const hwid = (n: number) => `${HWID_PREFIX}${String(n).padStart(6, '0')}`
const WEBHOOK_ID_PREFIX = 'itest-blog-'
const webhookId = (n: number) => `${WEBHOOK_ID_PREFIX}${n}`

const ADMIN = { email: 'itest-blog-admin@example.com', username: 'itest-blog-admin', password: 'itest-pw-1' }
const ORGANIZER = { email: 'itest-blog-org@example.com', username: 'itest-blog-org', password: 'itest-pw-1' }

describe('BeaconLogs (integration)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let admin: TestUser
  let organizer: TestUser
  let studentId: string
  let beaconId: string

  const server = () => app.getHttpServer()

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    configureApp(app)
    await app.init()
    prisma = app.get(PrismaService)

    await prisma.beaconLog.deleteMany({ where: { webhookEventId: { startsWith: WEBHOOK_ID_PREFIX } } })
    await prisma.beacon.deleteMany({ where: { hwid: { startsWith: HWID_PREFIX } } })
    await prisma.student.deleteMany({ where: { studentCode: { startsWith: CODE_PREFIX } } })
    await deleteTestUser(prisma, ADMIN.email)
    await deleteTestUser(prisma, ORGANIZER.email)
    admin = await createTestUser(app, prisma, { ...ADMIN, role: UserRole.ADMIN })
    organizer = await createTestUser(app, prisma, { ...ORGANIZER, role: UserRole.ORGANIZER })

    const student = await prisma.student.create({
      data: {
        studentCode: code(1),
        firstName: 'Somchai',
        lastName: 'Jaidee',
        birthDate: new Date('2004-01-01'),
        year: 3,
      },
    })
    studentId = student.id
    const beacon = await prisma.beacon.create({ data: { hwid: hwid(1), name: 'CS Room 101' } })
    beaconId = beacon.id

    // Four logs with staggered createdAt (ordering) and eventTimestamp (range
    // filters) so the two time dimensions are independently assertable.
    const log = (n: number, data: { hwid: string; lineUserId: string; eventType: string; status: string; student?: boolean }) =>
      prisma.beaconLog.create({
        data: {
          lineUserId: data.lineUserId,
          studentId: data.student ? studentId : null,
          beaconId: data.hwid === hwid(1) ? beaconId : null,
          hwid: data.hwid,
          eventType: data.eventType,
          eventTimestamp: new Date(`2026-02-0${n}T10:00:00.000Z`),
          webhookEventId: webhookId(n),
          processingStatus: data.status as never,
          rawPayload: { webhookEventId: webhookId(n), source: { type: 'beacon' } },
          createdAt: new Date(`2026-01-0${n}T00:00:00.000Z`),
        },
      })

    await log(1, { hwid: hwid(1), lineUserId: 'Ufeed0001', eventType: 'enter', status: 'PROCESSED', student: true })
    await log(2, { hwid: hwid(2), lineUserId: 'Ufeed0002', eventType: 'enter', status: 'UNKNOWN_USER' })
    await log(3, { hwid: hwid(1), lineUserId: 'Ufeed0001', eventType: 'stay', status: 'PROCESSED', student: true })
    await log(4, { hwid: hwid(3), lineUserId: 'Ufeed0004', eventType: 'enter', status: 'UNKNOWN_BEACON' })
  })

  afterAll(async () => {
    await prisma.beaconLog.deleteMany({ where: { webhookEventId: { startsWith: WEBHOOK_ID_PREFIX } } })
    await prisma.activityBeacon.deleteMany({ where: { activity: { name: { startsWith: 'ITEST-BLOG-' } } } })
    await prisma.activity.deleteMany({ where: { name: { startsWith: 'ITEST-BLOG-' } } })
    await prisma.beacon.deleteMany({ where: { hwid: { startsWith: HWID_PREFIX } } })
    await prisma.student.deleteMany({ where: { studentCode: { startsWith: CODE_PREFIX } } })
    await deleteTestUser(prisma, ADMIN.email)
    await deleteTestUser(prisma, ORGANIZER.email)
    await app.close()
  })

  // --- list (filters per spec §46) ---------------------------------------------

  it('GET /beacon-logs returns the paginated envelope (newest first by default)', async () => {
    const res = await request(server()).get('/api/v1/beacon-logs').set('Cookie', admin.cookie).expect(200)
    expect(res.body.success).toBe(true)
    const data = res.body.data
    expect(data.total).toBe(4)
    expect(data.items.map((l: { webhookEventId: string }) => l.webhookEventId)).toEqual([
      webhookId(4),
      webhookId(3),
      webhookId(2),
      webhookId(1),
    ])
    expect(data.items[3]).toMatchObject({
      lineUserId: 'Ufeed0001',
      hwid: hwid(1),
      eventType: 'enter',
      processingStatus: 'PROCESSED',
      student: { studentCode: code(1), name: 'Somchai Jaidee' },
      beacon: { name: 'CS Room 101' },
    })
    expect(data.items[1]).toMatchObject({ student: { studentCode: code(1) } })
  })

  it('GET /beacon-logs filters by hwid (case-insensitive)', async () => {
    const res = await request(server())
      .get(`/api/v1/beacon-logs?hwid=${hwid(1).toUpperCase()}`)
      .set('Cookie', admin.cookie)
      .expect(200)
    expect(res.body.data.total).toBe(2)
    expect(res.body.data.items.every((l: { hwid: string }) => l.hwid === hwid(1))).toBe(true)
  })

  it('GET /beacon-logs filters by studentId and by processing status', async () => {
    const byStudent = await request(server())
      .get(`/api/v1/beacon-logs?studentId=${studentId}`)
      .set('Cookie', admin.cookie)
      .expect(200)
    expect(byStudent.body.data.total).toBe(2)

    const byStatus = await request(server())
      .get('/api/v1/beacon-logs?status=UNKNOWN_BEACON')
      .set('Cookie', admin.cookie)
      .expect(200)
    expect(byStatus.body.data.total).toBe(1)
    expect(byStatus.body.data.items[0].webhookEventId).toBe(webhookId(4))
  })

  it('GET /beacon-logs filters by event-timestamp date range; from > to → 400', async () => {
    const res = await request(server())
      .get('/api/v1/beacon-logs?from=2026-02-02T00:00:00.000Z&to=2026-02-03T23:59:59.000Z')
      .set('Cookie', admin.cookie)
      .expect(200)
    expect(res.body.data.total).toBe(2)
    expect(res.body.data.items.map((l: { webhookEventId: string }) => l.webhookEventId)).toEqual([
      webhookId(3),
      webhookId(2),
    ])

    const badRange = await request(server())
      .get('/api/v1/beacon-logs?from=2026-02-03T00:00:00.000Z&to=2026-02-01T00:00:00.000Z')
      .set('Cookie', admin.cookie)
      .expect(400)
    expect(badRange.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('GET /beacon-logs search matches webhook event id and LINE user id case-insensitively', async () => {
    const byWebhookId = await request(server())
      .get(`/api/v1/beacon-logs?search=${webhookId(2).toUpperCase()}`)
      .set('Cookie', admin.cookie)
      .expect(200)
    expect(byWebhookId.body.data.total).toBe(1)

    const byLineUser = await request(server())
      .get('/api/v1/beacon-logs?search=ufeed0001')
      .set('Cookie', admin.cookie)
      .expect(200)
    expect(byLineUser.body.data.total).toBe(2)
  })

  it('GET /beacon-logs filters by activityId — only logs of the linked beacons (spec §24)', async () => {
    const activity = await prisma.activity.create({
      data: {
        name: 'ITEST-BLOG-Workshop',
        createdBy: admin.id,
        checkinOpenAt: new Date('2026-02-01T07:00:00Z'),
        lateAt: new Date('2026-02-01T08:10:00Z'),
        checkinCloseAt: new Date('2026-02-01T08:30:00Z'),
        startAt: new Date('2026-02-01T08:00:00Z'),
        endAt: new Date('2026-02-01T10:00:00Z'),
      },
      select: { id: true },
    })
    await prisma.activityBeacon.create({ data: { activityId: activity.id, beaconId } })

    const res = await request(server())
      .get(`/api/v1/beacon-logs?activityId=${activity.id}`)
      .set('Cookie', admin.cookie)
      .expect(200)
    // beacon 1 (hwid 1) is linked → its two logs; hwid 2/3 logs are excluded
    expect(res.body.data.total).toBe(2)
    expect(res.body.data.items.every((l: { hwid: string }) => l.hwid === hwid(1))).toBe(true)

    // an activity with no linked beacons matches nothing
    const unlinked = await prisma.activity.create({
      data: {
        name: 'ITEST-BLOG-NoBeacons',
        createdBy: admin.id,
        checkinOpenAt: new Date('2026-02-01T07:00:00Z'),
        lateAt: new Date('2026-02-01T08:10:00Z'),
        checkinCloseAt: new Date('2026-02-01T08:30:00Z'),
        startAt: new Date('2026-02-01T08:00:00Z'),
        endAt: new Date('2026-02-01T10:00:00Z'),
      },
      select: { id: true },
    })
    const empty = await request(server())
      .get(`/api/v1/beacon-logs?activityId=${unlinked.id}`)
      .set('Cookie', admin.cookie)
      .expect(200)
    expect(empty.body.data.total).toBe(0)
  })

  // --- detail (spec §18 — raw payload for debugging) ---------------------------

  it('GET /beacon-logs/:id returns the raw LINE payload; unknown id → 404', async () => {
    const listed = await request(server()).get('/api/v1/beacon-logs?status=UNKNOWN_USER').set('Cookie', admin.cookie).expect(200)
    const id = listed.body.data.items[0].id

    const res = await request(server()).get(`/api/v1/beacon-logs/${id}`).set('Cookie', admin.cookie).expect(200)
    expect(res.body.data).toMatchObject({ id, student: null, beacon: null })
    expect(res.body.data.rawPayload).toMatchObject({ webhookEventId: webhookId(2) })

    const notFound = await request(server()).get('/api/v1/beacon-logs/no-such-id').set('Cookie', admin.cookie).expect(404)
    expect(notFound.body).toEqual({ success: false, error: { code: 'NOT_FOUND', message: expect.any(String) } })
  })

  // --- access control (spec §4.3 — admin only) ----------------------------------

  it('organizer (non-admin) → 403 FORBIDDEN envelope', async () => {
    const res = await request(server()).get('/api/v1/beacon-logs').set('Cookie', organizer.cookie).expect(403)
    expect(res.body).toEqual({ success: false, error: { code: 'FORBIDDEN', message: expect.any(String) } })
  })

  it('unauthenticated → 401 envelope', async () => {
    const res = await request(server()).get('/api/v1/beacon-logs').expect(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })
})
