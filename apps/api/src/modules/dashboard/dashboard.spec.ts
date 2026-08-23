import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../../app.module'
import { configureApp } from '../../app.setup'
import { UserRole } from '../../generated/prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { createTestUser, deleteTestUser, TestUser } from '../../test/test-users'

const PREFIX = 'ITEST-DASH-'
const CODE_PREFIX = '669944'

const ADMIN = { email: 'itest-dash-admin@example.com', username: 'itest-dash-admin', password: 'itest-pw-1' }
const ORG1 = { email: 'itest-dash-org1@example.com', username: 'itest-dash-org1', password: 'itest-pw-1' }
const ORG2 = { email: 'itest-dash-org2@example.com', username: 'itest-dash-org2', password: 'itest-pw-1' }

describe('Dashboard (integration)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let admin: TestUser
  let org1: TestUser
  let org2: TestUser

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

    const now = Date.now()
    const times = (offsetMinutes: number) => ({
      checkinOpenAt: new Date(now - offsetMinutes * 60_000 - 10 * 60_000),
      lateAt: new Date(now - offsetMinutes * 60_000 - 5 * 60_000),
      checkinCloseAt: new Date(now + 30 * 60_000),
      startAt: new Date(now - offsetMinutes * 60_000),
      endAt: new Date(now + 60 * 60_000),
    })

    // org1: one PUBLISHED activity starting now (today) with an open window
    const live = await prisma.activity.create({
      data: { name: `${PREFIX}Live Workshop`, createdBy: org1.id, status: 'PUBLISHED', ...times(0) },
      select: { id: true },
    })
    // org1: one older activity from an earlier day
    await prisma.activity.create({
      data: {
        name: `${PREFIX}Old Camp`,
        createdBy: org1.id,
        status: 'PUBLISHED',
        checkinOpenAt: new Date('2025-01-01T01:00:00Z'),
        lateAt: new Date('2025-01-01T02:00:00Z'),
        checkinCloseAt: new Date('2025-01-01T03:00:00Z'),
        startAt: new Date('2025-01-01T02:00:00Z'),
        endAt: new Date('2025-01-01T04:00:00Z'),
      },
      select: { id: true },
    })
    // org2: one activity today — invisible to org1's dashboard
    await prisma.activity.create({
      data: { name: `${PREFIX}Other Org Today`, createdBy: org2.id, status: 'DRAFT', ...times(0) },
      select: { id: true },
    })

    // students with attendance on org1's live activity: 2 PRESENT + 1 LATE today
    const student = async (n: number) =>
      prisma.student.create({
        data: {
          studentCode: `${CODE_PREFIX}${String(n).padStart(6, '0')}`,
          firstName: 'Dash',
          lastName: `Test${n}`,
          birthDate: new Date('2004-01-01'),
          year: 1,
        },
        select: { id: true },
      })
    const s1 = await student(1)
    const s2 = await student(2)
    const s3 = await student(3)
    await prisma.attendance.createMany({
      data: [
        { activityId: live.id, studentId: s1.id, checkInAt: new Date(now - 60_000), status: 'PRESENT', checkinMethod: 'BEACON' },
        { activityId: live.id, studentId: s2.id, checkInAt: new Date(now - 60_000), status: 'PRESENT', checkinMethod: 'BEACON' },
        { activityId: live.id, studentId: s3.id, checkInAt: new Date(now - 30_000), status: 'LATE', checkinMethod: 'MANUAL', checkedInBy: org1.id },
      ],
    })
  })

  async function cleanup(): Promise<void> {
    await prisma.attendance.deleteMany({ where: { student: { studentCode: { startsWith: CODE_PREFIX } } } })
    await prisma.activity.deleteMany({ where: { name: { startsWith: PREFIX } } })
    await prisma.student.deleteMany({ where: { studentCode: { startsWith: CODE_PREFIX } } })
    for (const user of [ADMIN, ORG1, ORG2]) await deleteTestUser(prisma, user.email)
  }

  afterAll(async () => {
    await cleanup()
    await app.close()
  })

  it("organizer's overview covers only their own activities (spec §23, §29)", async () => {
    const res = await request(server()).get('/api/v1/dashboard').set('Cookie', org1.cookie).expect(200)
    const data = res.body.data
    expect(data.today).toMatchObject({ activities: 1, checkins: 3, present: 2, late: 1 })
    expect(data.totalActivities).toBe(2)

    expect(data.recentActivities.map((a: { name: string }) => a.name)).toContain(`${PREFIX}Live Workshop`)
    expect(data.recentActivities.every((a: { name: string }) => !a.name.includes('Other Org'))).toBe(true)

    expect(data.openCheckinActivities).toHaveLength(1)
    expect(data.openCheckinActivities[0]).toMatchObject({
      name: `${PREFIX}Live Workshop`,
      present: 2,
      late: 1,
    })
  })

  it("admin's overview spans every organizer", async () => {
    const res = await request(server()).get('/api/v1/dashboard').set('Cookie', admin.cookie).expect(200)
    const data = res.body.data
    expect(data.totalActivities).toBe(3) // both organizers' activities
    expect(data.today.activities).toBe(2) // Live Workshop + Other Org Today
    expect(data.today.checkins).toBe(3)
  })

  it('unauthenticated → 401', async () => {
    const res = await request(server()).get('/api/v1/dashboard').expect(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })
})
