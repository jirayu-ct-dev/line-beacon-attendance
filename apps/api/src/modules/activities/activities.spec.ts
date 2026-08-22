import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../../app.module'
import { configureApp } from '../../app.setup'
import { UserRole } from '../../generated/prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { createTestUser, deleteTestUser, TestUser } from '../../test/test-users'

const NAME_PREFIX = 'ITEST-ACT-'
const HWID_PREFIX = 'cafe' // hex chars; hwid = prefix + 6 digits
const hwid = (n: number) => `${HWID_PREFIX}${String(n).padStart(6, '0')}`

// Future windows (2027) so timeState stays UPCOMING regardless of run date.
// Day 10: W_A (02:00–04:00 close) and W_B (03:30–05:00 close) overlap on the
// check-in window; day 11 (W_C) is a clean, non-overlapping day.
const times = (day: number) => ({
  startAt: `2027-03-${day}T03:00:00.000Z`,
  endAt: `2027-03-${day}T05:00:00.000Z`,
  checkinOpenAt: `2027-03-${day}T02:00:00.000Z`,
  lateAt: `2027-03-${day}T03:30:00.000Z`,
  checkinCloseAt: `2027-03-${day}T04:00:00.000Z`,
})
const prismaTimes = (day: number) => {
  const t = times(day)
  return {
    startAt: new Date(t.startAt),
    endAt: new Date(t.endAt),
    checkinOpenAt: new Date(t.checkinOpenAt),
    lateAt: new Date(t.lateAt),
    checkinCloseAt: new Date(t.checkinCloseAt),
  }
}

const ADMIN = { email: 'itest-act-admin@example.com', username: 'itest-act-admin', password: 'itest-pw-1' }
const ORG1 = { email: 'itest-act-org1@example.com', username: 'itest-act-org1', password: 'itest-pw-1' }
const ORG2 = { email: 'itest-act-org2@example.com', username: 'itest-act-org2', password: 'itest-pw-1' }

describe('Activities (integration)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let admin: TestUser
  let org1: TestUser
  let org2: TestUser
  let beacon1: { id: string }
  let beacon2: { id: string }
  let act1: { id: string }
  let act2: { id: string }

  const server = () => app.getHttpServer()

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    configureApp(app)
    await app.init()
    prisma = app.get(PrismaService)

    await prisma.activityBeacon.deleteMany({
      where: { OR: [{ activity: { name: { startsWith: NAME_PREFIX } } }, { beacon: { hwid: { startsWith: HWID_PREFIX } } }] },
    })
    await prisma.activity.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } })
    await prisma.beacon.deleteMany({ where: { hwid: { startsWith: HWID_PREFIX } } })
    for (const user of [ADMIN, ORG1, ORG2]) await deleteTestUser(prisma, user.email)
    admin = await createTestUser(app, prisma, { ...ADMIN, role: UserRole.ADMIN })
    org1 = await createTestUser(app, prisma, { ...ORG1, role: UserRole.ORGANIZER })
    org2 = await createTestUser(app, prisma, { ...ORG2, role: UserRole.ORGANIZER })

    beacon1 = await prisma.beacon.create({ data: { hwid: hwid(1), name: 'Act Lab 1' } })
    beacon2 = await prisma.beacon.create({ data: { hwid: hwid(2), name: 'Act Lab 2' } })

    const seed = async (name: string, userId: string, day: number, createdAt: string) =>
      prisma.activity.create({
        data: { name, createdBy: userId, ...prismaTimes(day), createdAt: new Date(createdAt) },
        select: { id: true },
      })
    act1 = await seed(`${NAME_PREFIX}Orientation`, org1.id, 11, '2026-01-01T00:00:00Z')
    act2 = await seed(`${NAME_PREFIX}Meeting`, org1.id, 10, '2026-01-02T00:00:00Z')
    await seed(`${NAME_PREFIX}OtherOrg`, org2.id, 10, '2026-01-03T00:00:00Z')
  })

  afterAll(async () => {
    await prisma.activityBeacon.deleteMany({
      where: { OR: [{ activity: { name: { startsWith: NAME_PREFIX } } }, { beacon: { hwid: { startsWith: HWID_PREFIX } } }] },
    })
    await prisma.activity.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } })
    await prisma.beacon.deleteMany({ where: { hwid: { startsWith: HWID_PREFIX } } })
    for (const user of [ADMIN, ORG1, ORG2]) await deleteTestUser(prisma, user.email)
    await app.close()
  })

  // --- list (spec §29, §46) ------------------------------------------------------

  it('GET /activities — organizer sees only own activities, admin sees all', async () => {
    const asOrg1 = await request(server()).get('/api/v1/activities').set('Cookie', org1.cookie).expect(200)
    expect(asOrg1.body.data.total).toBe(2)
    expect(asOrg1.body.data.items.every((a: { creator: { id: string } }) => a.creator.id === org1.id)).toBe(true)

    const asAdmin = await request(server()).get('/api/v1/activities').set('Cookie', admin.cookie).expect(200)
    expect(asAdmin.body.data.total).toBe(3)
    // newest first (staggered createdAt)
    expect(asAdmin.body.data.items.map((a: { name: string }) => a.name)).toEqual([
      `${NAME_PREFIX}OtherOrg`,
      `${NAME_PREFIX}Meeting`,
      `${NAME_PREFIX}Orientation`,
    ])
    expect(asAdmin.body.data.items[0]).toMatchObject({ status: 'DRAFT', timeState: 'UPCOMING', beaconCount: 0 })
  })

  it('GET /activities filters by status/search and rejects unknown sort fields', async () => {
    const byStatus = await request(server())
      .get('/api/v1/activities?status=PUBLISHED')
      .set('Cookie', admin.cookie)
      .expect(200)
    expect(byStatus.body.data.total).toBe(0)

    const bySearch = await request(server())
      .get(`/api/v1/activities?search=${encodeURIComponent('orientation')}`)
      .set('Cookie', admin.cookie)
      .expect(200)
    expect(bySearch.body.data.total).toBe(1)

    const badSort = await request(server())
      .get('/api/v1/activities?sort=password')
      .set('Cookie', admin.cookie)
      .expect(400)
    expect(badSort.body.error.code).toBe('VALIDATION_ERROR')
  })

  // --- get (spec §29) -------------------------------------------------------------

  it('GET /activities/:id returns creator + beacons; 404 unknown; 403 for another organizer', async () => {
    const res = await request(server()).get(`/api/v1/activities/${act1.id}`).set('Cookie', admin.cookie).expect(200)
    expect(res.body.data).toMatchObject({
      name: `${NAME_PREFIX}Orientation`,
      status: 'DRAFT',
      creator: { username: ORG1.username },
      beacons: [],
    })

    await request(server()).get('/api/v1/activities/no-such-id').set('Cookie', admin.cookie).expect(404)

    const forbidden = await request(server()).get(`/api/v1/activities/${act1.id}`).set('Cookie', org2.cookie).expect(403)
    expect(forbidden.body).toEqual({ success: false, error: { code: 'FORBIDDEN', message: expect.any(String) } })
  })

  // --- create (spec §47 time rules) -------------------------------------------------

  it('POST /activities with invalid time orderings → 400 VALIDATION_ERROR', async () => {
    const base = { name: `${NAME_PREFIX}Bad`, ...times(10) }
    const violations = [
      { ...base, startAt: times(10).endAt }, // start >= end
      { ...base, checkinOpenAt: '2027-03-10T03:30:00.000Z' }, // open after start
      { ...base, lateAt: '2027-03-10T01:30:00.000Z' }, // late before open
      { ...base, lateAt: '2027-03-10T04:30:00.000Z' }, // late after close
      { ...base, checkinCloseAt: '2027-03-10T05:30:00.000Z' }, // close after end
      { ...base, startAt: '2027-03-10 03:00' }, // not ISO UTC
    ]
    for (const body of violations) {
      const res = await request(server()).post('/api/v1/activities').set('Cookie', org1.cookie).send(body).expect(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    }
  })

  it('POST /activities valid → 201 DRAFT + ACTIVITY_CREATED audit row', async () => {
    const res = await request(server())
      .post('/api/v1/activities')
      .set('Cookie', org1.cookie)
      .send({ name: `${NAME_PREFIX}Fresh`, location: 'ห้อง 101', ...times(12) })
      .expect(201)
    expect(res.body.data).toMatchObject({ status: 'DRAFT', timeState: 'UPCOMING', beaconCount: 0 })

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'ACTIVITY_CREATED', entityId: res.body.data.id, userId: org1.id },
    })
    expect(audit?.newValue).toMatchObject({ name: `${NAME_PREFIX}Fresh`, status: 'DRAFT' })
  })

  // --- update (spec §29, §47) ------------------------------------------------------

  it('PATCH /activities/:id — owner renames (audit old/new); other organizer → 403; invalid times → 400', async () => {
    const res = await request(server())
      .patch(`/api/v1/activities/${act1.id}`)
      .set('Cookie', org1.cookie)
      .send({ name: `${NAME_PREFIX}Orientation Renamed` })
      .expect(200)
    expect(res.body.data.name).toBe(`${NAME_PREFIX}Orientation Renamed`)

    const audit = await prisma.auditLog.findFirst({ where: { action: 'ACTIVITY_UPDATED', entityId: act1.id } })
    expect(audit?.oldValue).toMatchObject({ name: `${NAME_PREFIX}Orientation` })
    expect(audit?.newValue).toMatchObject({ name: `${NAME_PREFIX}Orientation Renamed` })

    await request(server())
      .patch(`/api/v1/activities/${act1.id}`)
      .set('Cookie', org2.cookie)
      .send({ name: 'Hijack' })
      .expect(403)

    await request(server())
      .patch(`/api/v1/activities/${act1.id}`)
      .set('Cookie', org1.cookie)
      .send({ endAt: '2027-03-11T01:00:00.000Z' }) // before start
      .expect(400)
  })

  // --- activity ↔ beacon mapping (spec §14, §38) --------------------------------------

  it('link/list/unlink beacons on a DRAFT activity; duplicate link and unlink are idempotent', async () => {
    const linked = await request(server())
      .post(`/api/v1/activities/${act2.id}/beacons`)
      .set('Cookie', org1.cookie)
      .send({ beaconId: beacon1.id })
      .expect(201)
    expect(linked.body.data).toMatchObject({ id: beacon1.id, hwid: hwid(1) })

    const list = await request(server()).get(`/api/v1/activities/${act2.id}/beacons`).set('Cookie', org1.cookie).expect(200)
    expect(list.body.data).toHaveLength(1)

    // duplicate link → no-op success, still one ACTIVITY_BEACON_LINKED audit row
    await request(server())
      .post(`/api/v1/activities/${act2.id}/beacons`)
      .set('Cookie', org1.cookie)
      .send({ beaconId: beacon1.id })
      .expect(201)
    const linkAudits = await prisma.auditLog.count({
      where: { action: 'ACTIVITY_BEACON_LINKED', entityId: act2.id },
    })
    expect(linkAudits).toBe(1)

    await request(server())
      .post(`/api/v1/activities/${act2.id}/beacons`)
      .set('Cookie', org1.cookie)
      .send({ beaconId: 'no-such-beacon' })
      .expect(404)

    // other organizer cannot touch the mapping
    await request(server())
      .delete(`/api/v1/activities/${act2.id}/beacons/${beacon1.id}`)
      .set('Cookie', org2.cookie)
      .expect(403)

    await request(server())
      .delete(`/api/v1/activities/${act2.id}/beacons/${beacon1.id}`)
      .set('Cookie', org1.cookie)
      .expect(200)
    const afterUnlink = await request(server())
      .get(`/api/v1/activities/${act2.id}/beacons`)
      .set('Cookie', org1.cookie)
      .expect(200)
    expect(afterUnlink.body.data).toHaveLength(0)
    // idempotent unlink (not linked anymore)
    await request(server())
      .delete(`/api/v1/activities/${act2.id}/beacons/${beacon1.id}`)
      .set('Cookie', org1.cookie)
      .expect(200)
    expect(
      await prisma.auditLog.count({ where: { action: 'ACTIVITY_BEACON_UNLINKED', entityId: act2.id } }),
    ).toBe(1)
  })

  // --- publish / cancel (spec §12, §35, §38, §54.4) -----------------------------------

  it('publish without beacons → 400; with beacons → PUBLISHED + audit', async () => {
    await request(server())
      .post(`/api/v1/activities/${act2.id}/publish`)
      .set('Cookie', org1.cookie)
      .expect(400) // beacons were unlinked in the previous test

    await request(server())
      .post(`/api/v1/activities/${act2.id}/beacons`)
      .set('Cookie', org1.cookie)
      .send({ beaconId: beacon1.id })
      .expect(201)

    const res = await request(server())
      .post(`/api/v1/activities/${act2.id}/publish`)
      .set('Cookie', org1.cookie)
      .expect(201)
    expect(res.body.data).toMatchObject({ status: 'PUBLISHED', beaconCount: 1 })

    const audit = await prisma.auditLog.findFirst({ where: { action: 'ACTIVITY_PUBLISHED', entityId: act2.id } })
    expect(audit?.newValue).toMatchObject({ status: 'PUBLISHED' })
  })

  it('overlap rule (§38) — publish/link/update against a published window sharing a beacon', async () => {
    // act2 is PUBLISHED with beacon1, day 10 (02:00–04:00). A DRAFT on the same
    // window can be created and even link the same beacon — drafts don't block.
    const draft = await request(server())
      .post('/api/v1/activities')
      .set('Cookie', org1.cookie)
      .send({ name: `${NAME_PREFIX}Overlap Draft`, ...times(10) })
      .expect(201)
    await request(server())
      .post(`/api/v1/activities/${draft.body.data.id}/beacons`)
      .set('Cookie', org1.cookie)
      .send({ beaconId: beacon1.id })
      .expect(201)

    // …but publishing it is rejected, naming the conflicting activity.
    const conflict = await request(server())
      .post(`/api/v1/activities/${draft.body.data.id}/publish`)
      .set('Cookie', org1.cookie)
      .expect(409)
    expect(conflict.body.error.code).toBe('CONFLICT')
    expect(conflict.body.error.message).toContain(`${NAME_PREFIX}Meeting`)

    // Moving the draft to a non-overlapping day (PATCH, still DRAFT) lets it publish.
    await request(server())
      .patch(`/api/v1/activities/${draft.body.data.id}`)
      .set('Cookie', org1.cookie)
      .send(times(11))
      .expect(200)
    await request(server())
      .post(`/api/v1/activities/${draft.body.data.id}/publish`)
      .set('Cookie', org1.cookie)
      .expect(201)

    // Linking a shared beacon to a PUBLISHED activity with an overlapping
    // window is rejected: act2 (day 10, beacon1) vs this published activity on
    // day 10 — give it beacon2, publish, then try to also add beacon1.
    const published = await request(server())
      .post('/api/v1/activities')
      .set('Cookie', org1.cookie)
      .send({ name: `${NAME_PREFIX}Overlap Live`, ...times(10) })
      .expect(201)
    await request(server())
      .post(`/api/v1/activities/${published.body.data.id}/beacons`)
      .set('Cookie', org1.cookie)
      .send({ beaconId: beacon2.id })
      .expect(201)
    await request(server())
      .post(`/api/v1/activities/${published.body.data.id}/publish`)
      .set('Cookie', org1.cookie)
      .expect(201)
    await request(server())
      .post(`/api/v1/activities/${published.body.data.id}/beacons`)
      .set('Cookie', org1.cookie)
      .send({ beaconId: beacon1.id })
      .expect(409)

    // Moving a PUBLISHED activity's window onto another published window that
    // shares a beacon is also rejected: act2 holds beacon1 (day 10) and
    // "Overlap Draft" is published with beacon1 on day 11.
    await request(server())
      .patch(`/api/v1/activities/${act2.id}`)
      .set('Cookie', org1.cookie)
      .send(times(11))
      .expect(409)
  })

  it('cancel → CANCELLED + audit; idempotent; cancelled cannot be published', async () => {
    const created = await request(server())
      .post('/api/v1/activities')
      .set('Cookie', org1.cookie)
      .send({ name: `${NAME_PREFIX}Lifecycle`, ...times(13) })
      .expect(201)
    const id = created.body.data.id
    await request(server()).post(`/api/v1/activities/${id}/beacons`).set('Cookie', org1.cookie).send({ beaconId: beacon2.id }).expect(201)
    await request(server()).post(`/api/v1/activities/${id}/publish`).set('Cookie', org1.cookie).expect(201)
    await request(server()).post(`/api/v1/activities/${id}/cancel`).set('Cookie', org1.cookie).expect(201)

    const cancelled = await request(server()).get(`/api/v1/activities/${id}`).set('Cookie', org1.cookie).expect(200)
    expect(cancelled.body.data.status).toBe('CANCELLED')

    await request(server()).post(`/api/v1/activities/${id}/cancel`).set('Cookie', org1.cookie).expect(201) // idempotent
    await request(server()).post(`/api/v1/activities/${id}/publish`).set('Cookie', org1.cookie).expect(409)

    const actions = await prisma.auditLog.findMany({ where: { entityId: id }, orderBy: { createdAt: 'asc' } })
    expect(actions.map((a) => a.action)).toEqual([
      'ACTIVITY_CREATED',
      'ACTIVITY_BEACON_LINKED',
      'ACTIVITY_PUBLISHED',
      'ACTIVITY_CANCELLED',
    ])
  })

  it('unauthenticated → 401 envelope', async () => {
    const res = await request(server()).get('/api/v1/activities').expect(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })
})
