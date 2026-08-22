import { INestApplication, UnauthorizedException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../../app.module'
import { configureApp } from '../../app.setup'
import { UserRole } from '../../generated/prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { createTestUser, deleteTestUser, TestUser } from '../../test/test-users'
import { LineTokenService } from './line-token.service'

/**
 * LIFF auth + account linking integration tests (spec §7.1, §35).
 *
 * LineTokenService is mocked at the DI level (valid/invalid tokens) — tests
 * never touch LINE. The domain rate limit (5 failed attempts per code per
 * hour) is exercised through the real LineLinkService.
 */

// All LINE user ids created by this spec share this prefix.
const USER_PREFIX = 'Utestlink'
const CODE_PREFIX = '668877' // student codes 668877xxxxxx
const code = (n: number) => `${CODE_PREFIX}${String(n).padStart(6, '0')}`

const BIRTH_DDMMYYYY = '05052004' // 2004-05-05 (seeded birth date)

/** Mocked token service: token string -> LINE identity; unknown tokens -> 401. */
const LINE_IDENTITIES: Record<string, { lineUserId: string; name?: string; picture?: string }> = {
  'token-a': { lineUserId: `${USER_PREFIX}A01`, name: 'สมชาย ทดสอบ', picture: 'https://example.test/pic.png' },
  'token-b': { lineUserId: `${USER_PREFIX}B01` },
  'token-c': { lineUserId: `${USER_PREFIX}C01` },
  'token-d': { lineUserId: `${USER_PREFIX}D01` },
}

const ADMIN = { email: 'itest-link-admin@example.com', username: 'itest-link-admin', password: 'itest-pw-1' }
const ORGANIZER = { email: 'itest-link-org@example.com', username: 'itest-link-org', password: 'itest-pw-1' }

describe('LINE link/unlink/me (integration)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let admin: TestUser
  let organizer: TestUser

  let studentId1: string
  let studentId2: string
  let studentId3: string
  let studentId4: string
  let studentId91: string

  const server = () => app.getHttpServer()

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })

  const link = (body: Record<string, string>, token = 'token-a', ip?: string) => {
    const req = request(server()).post('/api/v1/line/link').set(bearer(token)).send(body)
    return ip ? req.set('X-Forwarded-For', ip) : req
  }

  const me = (token: string) => request(server()).get('/api/v1/me').set(bearer(token))

  beforeAll(async () => {
    const tokenService = {
      verifyIdToken: jest.fn(async (token: string) => {
        const identity = LINE_IDENTITIES[token]
        if (identity) return identity
        throw new UnauthorizedException('การยืนยันตัวตนผ่าน LINE ไม่สำเร็จ กรุณาปิดและเปิดหน้านี้ใหม่อีกครั้ง')
      }),
    }

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(LineTokenService)
      .useValue(tokenService)
      .compile()
    app = moduleRef.createNestApplication()
    configureApp(app)
    // Give each logical group its own throttler bucket (rate-limit tests use
    // unique X-Forwarded-For values; the per-route limit is 10/min per IP).
    ;(app.getHttpAdapter().getInstance() as { set: (key: string, value: boolean) => void }).set('trust proxy', true)
    await app.init()
    prisma = app.get(PrismaService)

    await cleanup()
    admin = await createTestUser(app, prisma, { ...ADMIN, role: UserRole.ADMIN })
    organizer = await createTestUser(app, prisma, { ...ORGANIZER, role: UserRole.ORGANIZER })

    const seed = async (n: number, overrides: Record<string, unknown> = {}): Promise<string> => {
      const student = await prisma.student.create({
        data: {
          studentCode: code(n),
          firstName: 'Somchai',
          lastName: 'Test',
          birthDate: new Date('2004-05-05'),
          year: 3,
          ...overrides,
        },
        select: { id: true },
      })
      return student.id
    }
    studentId1 = await seed(1)
    studentId2 = await seed(2, { birthDate: new Date('2003-03-03') })
    studentId3 = await seed(3, { status: 'INACTIVE' })
    studentId4 = await seed(4)
    studentId91 = await seed(91)
    // Student 2 is pre-linked to LINE user B (conflict direction: student taken).
    await prisma.lineAccount.create({ data: { studentId: studentId2, lineUserId: `${USER_PREFIX}B01` } })
  })

  async function cleanup(): Promise<void> {
    await prisma.attendance.deleteMany({ where: { student: { studentCode: { startsWith: CODE_PREFIX } } } })
    await prisma.activity.deleteMany({ where: { name: { startsWith: 'กิจกรรมทดสอบการเข้าร่วม' } } })
    await prisma.lineAccount.deleteMany({ where: { lineUserId: { startsWith: USER_PREFIX } } })
    // Student self-service link/unlink audit rows (no dashboard user actor).
    await prisma.auditLog.deleteMany({ where: { userId: null, entityType: 'LINE_ACCOUNT' } })
    await prisma.student.deleteMany({ where: { studentCode: { startsWith: CODE_PREFIX } } })
    await deleteTestUser(prisma, ADMIN.email)
    await deleteTestUser(prisma, ORGANIZER.email)
  }

  afterAll(async () => {
    await cleanup()
    await app.close()
  })

  // --- auth ------------------------------------------------------------------------------

  it('rejects a missing Bearer token with a 401 envelope', async () => {
    const res = await request(server()).post('/api/v1/line/link').send({ studentCode: code(1), birthDate: BIRTH_DDMMYYYY })
    expect(res.status).toBe(401)
    expect(res.body).toEqual({
      success: false,
      error: { code: 'UNAUTHORIZED', message: expect.stringContaining('LINE') },
    })
  })

  it('rejects an invalid LINE ID Token with a 401 envelope', async () => {
    const res = await link({ studentCode: code(1), birthDate: BIRTH_DDMMYYYY }, 'not-a-real-token')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })

  it('rejects a malformed body with 400 VALIDATION_ERROR', async () => {
    const res = await link({ studentCode: '123', birthDate: '05052004' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  // --- link ------------------------------------------------------------------------------

  it('links a student on correct code + birth date, storing the LINE profile and audit row', async () => {
    const res = await link({ studentCode: code(1), birthDate: BIRTH_DDMMYYYY })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toMatchObject({
      linked: true,
      student: { id: studentId1, studentCode: code(1), firstName: 'Somchai', birthDate: '2004-05-05' },
      line: { lineUserId: `${USER_PREFIX}A01`, displayName: 'สมชาย ทดสอบ', pictureUrl: 'https://example.test/pic.png' },
    })

    await expect(
      prisma.lineAccount.findUniqueOrThrow({ where: { lineUserId: `${USER_PREFIX}A01` } }),
    ).resolves.toMatchObject({ studentId: studentId1, displayName: 'สมชาย ทดสอบ' })

    await expect(
      prisma.auditLog.findFirstOrThrow({ where: { action: 'LINE_ACCOUNT_LINKED', entityType: 'LINE_ACCOUNT' } }),
    ).resolves.toMatchObject({ userId: null })
  })

  it('returns the SAME generic error for a wrong birth date and an unknown code (no enumeration)', async () => {
    const wrongBirth = await link({ studentCode: code(1), birthDate: '01012004' })
    const unknownCode = await link({ studentCode: `${CODE_PREFIX}999999`, birthDate: BIRTH_DDMMYYYY })

    for (const res of [wrongBirth, unknownCode]) {
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('LINK_VERIFICATION_FAILED')
    }
    expect(unknownCode.body.error.message).toBe(wrongBirth.body.error.message)
    expect(wrongBirth.body.error.message).toContain('ไม่พบข้อมูลนักศึกษาหรือข้อมูลไม่ถูกต้อง')
  })

  it('rejects an INACTIVE student with the same generic message', async () => {
    const res = await link({ studentCode: code(3), birthDate: BIRTH_DDMMYYYY })
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('LINK_VERIFICATION_FAILED')
    await expect(prisma.lineAccount.findFirst({ where: { studentId: studentId3 } })).resolves.toBeNull()
  })

  it('rejects when the student is already linked to another LINE account (409)', async () => {
    const res = await link({ studentCode: code(2), birthDate: '03032003' }) // token-a, s2 already linked to B
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('STUDENT_ALREADY_LINKED')
  })

  it('rejects when this LINE account is already linked to another student (409)', async () => {
    const res = await link({ studentCode: code(4), birthDate: BIRTH_DDMMYYYY }, 'token-b') // B owns s2
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('LINE_ALREADY_LINKED')
    await expect(prisma.lineAccount.findFirst({ where: { studentId: studentId4 } })).resolves.toBeNull()
  })

  it('treats re-submitting the same pair as idempotent success', async () => {
    const res = await link({ studentCode: code(1), birthDate: BIRTH_DDMMYYYY })
    expect(res.status).toBe(200)
    expect(res.body.data.linked).toBe(true)
  })

  // --- domain rate limit (spec §7.1: max 5 failed attempts per code per hour) -------------

  it('answers 429 RATE_LIMITED on the 6th failed attempt for a student code', async () => {
    const body = { studentCode: code(90), birthDate: BIRTH_DDMMYYYY } // code(90) does not exist
    for (let i = 0; i < 5; i++) {
      const res = await link(body, 'token-a', '10.1.0.90')
      expect(res.status).toBe(404)
    }
    const res = await link(body, 'token-a', '10.1.0.90')
    expect(res.status).toBe(429)
    expect(res.body).toEqual({
      success: false,
      error: { code: 'RATE_LIMITED', message: expect.stringContaining('เกิน 5 ครั้ง') },
    })
  })

  it('resets the failure window after a successful link', async () => {
    const body = (birthDate: string) => ({ studentCode: code(91), birthDate })
    // 2 misses, then a success clears the window...
    await link(body('01012004'), 'token-c', '10.1.0.91').expect(404)
    await link(body('01012004'), 'token-c', '10.1.0.91').expect(404)
    const success = await link(body(BIRTH_DDMMYYYY), 'token-c', '10.1.0.91')
    expect(success.status).toBe(200)
    // ...so 5 more misses are allowed and only the 6th is blocked.
    for (let i = 0; i < 5; i++) {
      await link(body('01012004'), 'token-c', '10.1.0.91').expect(404)
    }
    await link(body('01012004'), 'token-c', '10.1.0.91').expect(429)
    expect(await prisma.lineAccount.count({ where: { studentId: studentId91 } })).toBe(1)
  })

  // --- /me + /me/attendances (spec §35) ---------------------------------------------------

  it('GET /me returns the linked student for A/B and linked:false for an unlinked LINE user', async () => {
    const resA = await me('token-a')
    expect(resA.status).toBe(200)
    expect(resA.body.data).toMatchObject({
      linked: true,
      student: { studentCode: code(1) },
      line: { lineUserId: `${USER_PREFIX}A01` },
    })

    const resD = await me('token-d')
    expect(resD.status).toBe(200)
    expect(resD.body.data).toEqual({ linked: false, student: null, line: null })
  })

  it('GET /me/attendances returns own history newest first (empty for unlinked users)', async () => {
    // One attendance per activity per student (UNIQUE(activity_id, student_id),
    // spec §54.7) — two activities give the ordering something to sort.
    const activityIds: string[] = []
    for (const name of ['กิจกรรมทดสอบการเข้าร่วม 1', 'กิจกรรมทดสอบการเข้าร่วม 2']) {
      const activity = await prisma.activity.create({
        data: {
          name,
          startAt: new Date('2026-08-20T09:00:00Z'),
          endAt: new Date('2026-08-20T12:00:00Z'),
          checkinOpenAt: new Date('2026-08-20T08:30:00Z'),
          lateAt: new Date('2026-08-20T09:15:00Z'),
          checkinCloseAt: new Date('2026-08-20T11:00:00Z'),
          createdBy: admin.id,
        },
        select: { id: true },
      })
      activityIds.push(activity.id)
    }
    const seeds: Array<{ activityId: string; time: string; status: string }> = [
      { activityId: activityIds[0]!, time: '10:05:00', status: 'LATE' },
      { activityId: activityIds[1]!, time: '09:05:00', status: 'PRESENT' },
    ]
    for (const { activityId, time, status } of seeds) {
      await prisma.attendance.create({
        data: {
          activityId,
          studentId: studentId1,
          checkInAt: new Date(`2026-08-20T${time}Z`),
          status: status as 'LATE' | 'PRESENT',
          checkinMethod: 'BEACON',
        },
      })
    }

    const res = await request(server()).get('/api/v1/me/attendances').set(bearer('token-a'))
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      items: [
        {
          id: expect.any(String),
          activityId: activityIds[0],
          activityName: 'กิจกรรมทดสอบการเข้าร่วม 1',
          checkInAt: '2026-08-20T10:05:00.000Z',
          status: 'LATE',
          checkinMethod: 'BEACON',
        },
        {
          id: expect.any(String),
          activityId: activityIds[1],
          activityName: 'กิจกรรมทดสอบการเข้าร่วม 2',
          checkInAt: '2026-08-20T09:05:00.000Z',
          status: 'PRESENT',
          checkinMethod: 'BEACON',
        },
      ],
      total: 2,
      page: 1,
      pageSize: 20,
    })

    const resD = await request(server()).get('/api/v1/me/attendances').set(bearer('token-d'))
    expect(resD.status).toBe(200)
    expect(resD.body.data).toEqual({ items: [], total: 0, page: 1, pageSize: 20 })
  })

  it('GET /me without a Bearer token is a 401 envelope', async () => {
    const res = await request(server()).get('/api/v1/me')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })

  // --- self unlink -------------------------------------------------------------------------

  it('lets the caller unlink their own account (idempotent) and writes a null-actor audit row', async () => {
    const res = await request(server()).post('/api/v1/line/unlink').set(bearer('token-a'))
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, data: null })
    await expect(prisma.lineAccount.findUnique({ where: { lineUserId: `${USER_PREFIX}A01` } })).resolves.toBeNull()
    const after = await me('token-a')
    expect(after.status).toBe(200)
    expect(after.body.data).toEqual({ linked: false, student: null, line: null })
    await expect(
      prisma.auditLog.findFirstOrThrow({ where: { action: 'LINE_ACCOUNT_UNLINKED', userId: null } }),
    ).resolves.toMatchObject({ entityType: 'LINE_ACCOUNT' })

    // Idempotent: unlinking again still succeeds.
    await request(server()).post('/api/v1/line/unlink').set(bearer('token-a')).expect(200)
  })

  // --- admin unlink (POST /students/:id/unlink-line) ---------------------------------------

  it('rejects admin unlink without a dashboard session (401) and for organizers (403)', async () => {
    await request(server()).post(`/api/v1/students/${studentId2}/unlink-line`).expect(401)
    await request(server())
      .post(`/api/v1/students/${studentId2}/unlink-line`)
      .set('Cookie', organizer.cookie)
      .expect(403)
    await expect(prisma.lineAccount.findUnique({ where: { studentId: studentId2 } })).resolves.not.toBeNull()
  })

  it('lets an admin unlink a student LINE account (audited) and is idempotent', async () => {
    const res = await request(server())
      .post(`/api/v1/students/${studentId2}/unlink-line`)
      .set('Cookie', admin.cookie)
    expect(res.status).toBe(201) // Nest POST default — same as disable/enable
    expect(res.body.data).toMatchObject({ id: studentId2, lineLinked: false })
    await expect(prisma.lineAccount.findUnique({ where: { studentId: studentId2 } })).resolves.toBeNull()

    await expect(
      prisma.auditLog.findFirstOrThrow({ where: { action: 'LINE_ACCOUNT_UNLINKED', userId: admin.id } }),
    ).resolves.toMatchObject({ entityType: 'LINE_ACCOUNT', entityId: expect.any(String) })

    // No link left — calling again succeeds without a second audit row.
    await request(server())
      .post(`/api/v1/students/${studentId2}/unlink-line`)
      .set('Cookie', admin.cookie)
      .expect(201)
    expect(await prisma.auditLog.count({ where: { action: 'LINE_ACCOUNT_UNLINKED', userId: admin.id } })).toBe(1)
  })
})
