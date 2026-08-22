import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../../app.module'
import { configureApp } from '../../app.setup'
import { UserRole } from '../../generated/prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { createTestUser, deleteTestUser, TestUser } from '../../test/test-users'

// All beacons created by this spec share this hex hwid prefix (hwid = prefix + 6 digits).
const HWID_PREFIX = 'beef'
const hwid = (n: number) => `${HWID_PREFIX}${String(n).padStart(6, '0')}` // e.g. beef000001

const ADMIN = { email: 'itest-beacons-admin@example.com', username: 'itest-beacons-admin', password: 'itest-pw-1' }
const ORGANIZER = { email: 'itest-beacons-org@example.com', username: 'itest-beacons-org', password: 'itest-pw-1' }

describe('Beacons (integration)', () => {
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

    await prisma.beacon.deleteMany({ where: { hwid: { startsWith: HWID_PREFIX } } })
    await deleteTestUser(prisma, ADMIN.email)
    await deleteTestUser(prisma, ORGANIZER.email)
    admin = await createTestUser(app, prisma, { ...ADMIN, role: UserRole.ADMIN })
    organizer = await createTestUser(app, prisma, { ...ORGANIZER, role: UserRole.ORGANIZER })

    // Staggered createdAt: createMany in one statement would give identical
    // timestamps, making the default newest-first ordering ambiguous.
    await prisma.beacon.create({
      data: { hwid: hwid(1), name: 'CS Room 101', location: 'CS101', createdAt: new Date('2026-01-01T00:00:00Z') },
    })
    await prisma.beacon.create({
      data: { hwid: hwid(2), name: 'Library Beacon', location: 'LIB-2F', createdAt: new Date('2026-01-02T00:00:00Z') },
    })
    await prisma.beacon.create({
      data: {
        hwid: hwid(3),
        name: 'Old Lab',
        location: 'LAB1',
        status: 'INACTIVE',
        createdAt: new Date('2026-01-03T00:00:00Z'),
      },
    })
  })

  afterAll(async () => {
    await prisma.beacon.deleteMany({ where: { hwid: { startsWith: HWID_PREFIX } } })
    await deleteTestUser(prisma, ADMIN.email)
    await deleteTestUser(prisma, ORGANIZER.email)
    await app.close()
  })

  // --- list (pagination / search / filter, spec §35, §46) ----------------------

  it('GET /beacons returns the paginated envelope (newest first by default)', async () => {
    const res = await request(server()).get('/api/v1/beacons').set('Cookie', admin.cookie).expect(200)
    expect(res.body.success).toBe(true)
    const data = res.body.data
    expect(data.total).toBe(3)
    expect(data.items).toHaveLength(3)
    expect(data.items.map((b: { hwid: string }) => b.hwid)).toEqual([hwid(3), hwid(2), hwid(1)])
    expect(data.items[0]).toMatchObject({
      id: expect.any(String),
      hwid: hwid(3),
      name: 'Old Lab',
      location: 'LAB1',
      status: 'INACTIVE',
    })
  })

  it('GET /beacons pagination — pageSize=2 page=2 returns the remaining item', async () => {
    const res = await request(server())
      .get('/api/v1/beacons?page=2&pageSize=2')
      .set('Cookie', admin.cookie)
      .expect(200)
    expect(res.body.data).toMatchObject({ total: 3, page: 2, pageSize: 2 })
    expect(res.body.data.items).toHaveLength(1)
  })

  it('GET /beacons search matches hwid/name/location case-insensitively', async () => {
    const byName = await request(server()).get('/api/v1/beacons?search=ROOM').set('Cookie', admin.cookie).expect(200)
    expect(byName.body.data.total).toBe(1)
    expect(byName.body.data.items[0].name).toBe('CS Room 101')

    const byLocation = await request(server())
      .get('/api/v1/beacons?search=lib-2f')
      .set('Cookie', admin.cookie)
      .expect(200)
    expect(byLocation.body.data.total).toBe(1)
    expect(byLocation.body.data.items[0].hwid).toBe(hwid(2))

    const byHwid = await request(server()).get('/api/v1/beacons?search=000002').set('Cookie', admin.cookie).expect(200)
    expect(byHwid.body.data.total).toBe(1)
    expect(byHwid.body.data.items[0].hwid).toBe(hwid(2))
  })

  it('GET /beacons filters by status, and rejects unknown sort fields', async () => {
    const res = await request(server()).get('/api/v1/beacons?status=ACTIVE').set('Cookie', admin.cookie).expect(200)
    expect(res.body.data.total).toBe(2)

    const badSort = await request(server()).get('/api/v1/beacons?sort=password').set('Cookie', admin.cookie).expect(400)
    expect(badSort.body.error.code).toBe('VALIDATION_ERROR')
  })

  // --- create (spec §13, §47) --------------------------------------------------

  it('POST /beacons with an invalid hwid → 400 VALIDATION_ERROR', async () => {
    for (const hwid of ['12345', 'zzzz000001', 'beef0000011', '']) {
      const res = await request(server())
        .post('/api/v1/beacons')
        .set('Cookie', admin.cookie)
        .send({ hwid, name: 'Bad' })
        .expect(400)
      expect(res.body).toEqual({ success: false, error: { code: 'VALIDATION_ERROR', message: expect.any(String) } })
    }
  })

  it('POST /beacons with a duplicate hwid → 409 CONFLICT (case-insensitive after normalization)', async () => {
    const sameCase = await request(server())
      .post('/api/v1/beacons')
      .set('Cookie', admin.cookie)
      .send({ hwid: hwid(1), name: 'Dup' })
      .expect(409)
    expect(sameCase.body).toEqual({ success: false, error: { code: 'CONFLICT', message: expect.any(String) } })

    // Uppercase input normalizes to the stored lowercase hwid → still a duplicate
    await request(server())
      .post('/api/v1/beacons')
      .set('Cookie', admin.cookie)
      .send({ hwid: hwid(1).toUpperCase(), name: 'Dup' })
      .expect(409)
  })

  it('POST /beacons valid → 201, hwid stored lowercase, BEACON_CREATED audit row written', async () => {
    const res = await request(server())
      .post('/api/v1/beacons')
      .set('Cookie', admin.cookie)
      .send({ hwid: 'FEED000011', name: 'New Beacon', location: 'LAB2', description: 'ทดสอบ' })
      .expect(201)
    expect(res.body.data).toMatchObject({
      hwid: 'feed000011',
      name: 'New Beacon',
      status: 'ACTIVE',
      location: 'LAB2',
    })

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'BEACON_CREATED', entityId: res.body.data.id, userId: admin.id },
    })
    expect(audit?.newValue).toMatchObject({ hwid: 'feed000011', name: 'New Beacon' })
  })

  // --- get / update --------------------------------------------------------------

  it('GET /beacons/:id unknown id → 404 NOT_FOUND envelope', async () => {
    const res = await request(server()).get('/api/v1/beacons/no-such-id').set('Cookie', admin.cookie).expect(404)
    expect(res.body).toEqual({ success: false, error: { code: 'NOT_FOUND', message: expect.any(String) } })
  })

  it('PATCH /beacons/:id updates fields and writes BEACON_UPDATED with old/new', async () => {
    const created = await request(server())
      .post('/api/v1/beacons')
      .set('Cookie', admin.cookie)
      .send({ hwid: hwid(12), name: 'Old Name', location: 'X' })
      .expect(201)

    const res = await request(server())
      .patch(`/api/v1/beacons/${created.body.data.id}`)
      .set('Cookie', admin.cookie)
      .send({ name: 'New Name' })
      .expect(200)
    expect(res.body.data).toMatchObject({ hwid: hwid(12), name: 'New Name', location: 'X' })

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'BEACON_UPDATED', entityId: created.body.data.id },
    })
    expect(audit?.oldValue).toMatchObject({ name: 'Old Name' })
    expect(audit?.newValue).toMatchObject({ name: 'New Name' })
  })

  it('PATCH /beacons/:id changing the hwid to an existing one → 409 CONFLICT', async () => {
    const created = await request(server())
      .post('/api/v1/beacons')
      .set('Cookie', admin.cookie)
      .send({ hwid: hwid(13), name: 'X' })
      .expect(201)

    await request(server())
      .patch(`/api/v1/beacons/${created.body.data.id}`)
      .set('Cookie', admin.cookie)
      .send({ hwid: hwid(1) })
      .expect(409)
  })

  it('PATCH /beacons/:id can set MAINTENANCE via status (audited as BEACON_UPDATED)', async () => {
    const created = await request(server())
      .post('/api/v1/beacons')
      .set('Cookie', admin.cookie)
      .send({ hwid: hwid(14), name: 'Maint' })
      .expect(201)

    const res = await request(server())
      .patch(`/api/v1/beacons/${created.body.data.id}`)
      .set('Cookie', admin.cookie)
      .send({ status: 'MAINTENANCE' })
      .expect(200)
    expect(res.body.data.status).toBe('MAINTENANCE')

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'BEACON_UPDATED', entityId: created.body.data.id },
    })
    expect(audit?.newValue).toMatchObject({ status: 'MAINTENANCE' })
  })

  // --- disable / enable (spec §35 — no hard delete) ------------------------------

  it('disable → INACTIVE + BEACON_DISABLED audit; enable → ACTIVE + BEACON_ENABLED; idempotent re-disable writes no extra audit', async () => {
    const created = await request(server())
      .post('/api/v1/beacons')
      .set('Cookie', admin.cookie)
      .send({ hwid: hwid(15), name: 'D' })
      .expect(201)
    const id = created.body.data.id

    const disabled = await request(server())
      .post(`/api/v1/beacons/${id}/disable`)
      .set('Cookie', admin.cookie)
      .expect(201)
    expect(disabled.body.data.status).toBe('INACTIVE')

    const enabled = await request(server()).post(`/api/v1/beacons/${id}/enable`).set('Cookie', admin.cookie).expect(201)
    expect(enabled.body.data.status).toBe('ACTIVE')

    await request(server()).post(`/api/v1/beacons/${id}/disable`).set('Cookie', admin.cookie).expect(201)
    await request(server()).post(`/api/v1/beacons/${id}/disable`).set('Cookie', admin.cookie).expect(201) // idempotent

    const actions = await prisma.auditLog.findMany({ where: { entityId: id }, orderBy: { createdAt: 'asc' } })
    expect(actions.map((a) => a.action)).toEqual(['BEACON_CREATED', 'BEACON_DISABLED', 'BEACON_ENABLED', 'BEACON_DISABLED'])
  })

  // --- access control (spec §13 — admin manages, organizer reads) -----------------

  it('organizer can read but gets 403 FORBIDDEN on every beacon mutation', async () => {
    const read = await request(server()).get('/api/v1/beacons').set('Cookie', organizer.cookie).expect(200)
    expect(read.body.success).toBe(true)

    for (const [method, path] of [
      ['post', '/api/v1/beacons'],
      ['patch', `/api/v1/beacons/${read.body.data.items[0].id}`],
      ['post', `/api/v1/beacons/${read.body.data.items[0].id}/disable`],
      ['post', `/api/v1/beacons/${read.body.data.items[0].id}/enable`],
    ] as const) {
      const res = await request(server())[method](path).set('Cookie', organizer.cookie).expect(403)
      expect(res.body).toEqual({ success: false, error: { code: 'FORBIDDEN', message: expect.any(String) } })
    }
  })

  it('unauthenticated → 401 envelope', async () => {
    const res = await request(server()).get('/api/v1/beacons').expect(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })
})
