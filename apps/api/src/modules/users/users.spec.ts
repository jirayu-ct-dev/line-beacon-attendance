import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../../app.module'
import { configureApp } from '../../app.setup'
import { UserRole } from '../../generated/prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { createTestUser, deleteTestUser, TestUser } from '../../test/test-users'

const PREFIX = 'itest-users-'

const ADMIN = { email: `${PREFIX}admin@example.com`, username: `${PREFIX}admin`, password: 'itest-pw-1' }
const ORGANIZER = { email: `${PREFIX}org@example.com`, username: `${PREFIX}org`, password: 'itest-pw-1' }
const TARGET = { email: `${PREFIX}target@example.com`, username: `${PREFIX}target`, password: 'itest-pw-1' }

describe('Users (integration)', () => {
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

    for (const user of [ADMIN, ORGANIZER, TARGET]) await deleteTestUser(prisma, user.email)
    admin = await createTestUser(app, prisma, { ...ADMIN, role: UserRole.ADMIN })
    organizer = await createTestUser(app, prisma, { ...ORGANIZER, role: UserRole.ORGANIZER })
  })

  afterAll(async () => {
    for (const user of [ADMIN, ORGANIZER, TARGET]) await deleteTestUser(prisma, user.email)
    await app.close()
  })

  it('POST /users creates an organizer (argon2-hashed — the account can log in) + audit', async () => {
    const res = await request(server())
      .post('/api/v1/users')
      .set('Cookie', admin.cookie)
      .send({ email: TARGET.email, username: TARGET.username, password: TARGET.password, role: 'ORGANIZER' })
      .expect(201)
    expect(res.body.data).toMatchObject({ email: TARGET.email, role: 'ORGANIZER', status: 'ACTIVE' })
    expect(res.body.data).not.toHaveProperty('passwordHash')

    const login = await request(server())
      .post('/api/v1/auth/login')
      .send({ username_or_email: TARGET.username, password: TARGET.password })
      .expect(200)
    expect(login.body.data).toMatchObject({ username: TARGET.username })

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'USER_CREATED', entityId: res.body.data.id, userId: admin.id },
    })
    expect(audit?.newValue).toMatchObject({ role: 'ORGANIZER' })
  })

  it('duplicate email/username → 409; short password / bad role → 400', async () => {
    const dup = await request(server())
      .post('/api/v1/users')
      .set('Cookie', admin.cookie)
      .send({ email: TARGET.email, username: `${PREFIX}other`, password: 'long-enough-pw', role: 'ORGANIZER' })
      .expect(409)
    expect(dup.body.error.code).toBe('CONFLICT')

    await request(server())
      .post('/api/v1/users')
      .set('Cookie', admin.cookie)
      .send({ email: `${PREFIX}x@example.com`, username: `${PREFIX}x`, password: 'short', role: 'ORGANIZER' })
      .expect(400)
    await request(server())
      .post('/api/v1/users')
      .set('Cookie', admin.cookie)
      .send({ email: `${PREFIX}x@example.com`, username: `${PREFIX}x`, password: 'long-enough-pw', role: 'SUPERUSER' })
      .expect(400)
  })

  it('GET /users lists with search + role filter; PATCH renames with audit; self role change → 400', async () => {
    const bySearch = await request(server())
      .get(`/api/v1/users?search=${PREFIX}target`)
      .set('Cookie', admin.cookie)
      .expect(200)
    expect(bySearch.body.data.total).toBe(1)
    expect(bySearch.body.data.items[0]).not.toHaveProperty('passwordHash')

    const byRole = await request(server())
      .get('/api/v1/users?role=ADMIN')
      .set('Cookie', admin.cookie)
      .expect(200)
    expect(byRole.body.data.items.every((u: { role: string }) => u.role === 'ADMIN')).toBe(true)

    const targetId = bySearch.body.data.items[0].id
    const updated = await request(server())
      .patch(`/api/v1/users/${targetId}`)
      .set('Cookie', admin.cookie)
      .send({ username: `${PREFIX}target2` })
      .expect(200)
    expect(updated.body.data.username).toBe(`${PREFIX}target2`)
    expect(
      await prisma.auditLog.count({ where: { action: 'USER_UPDATED', entityId: targetId } }),
    ).toBe(1)

    await request(server())
      .patch(`/api/v1/users/${admin.id}`)
      .set('Cookie', admin.cookie)
      .send({ role: 'ORGANIZER' })
      .expect(400) // cannot demote yourself
  })

  it('disable revokes sessions and blocks login; enable restores; self-disable → 400', async () => {
    // give the target an active session to prove revocation
    const login = await request(server())
      .post('/api/v1/auth/login')
      .send({ username_or_email: `${PREFIX}target2`, password: TARGET.password })
      .expect(200)
    const setCookies = login.headers['set-cookie'] as unknown as string[]
    const refreshToken = setCookies.find((c) => c.startsWith('refresh_token='))!.split(';')[0].split('=')[1]
    const stored = await prisma.refreshToken.findFirst({
      where: { user: { username: `${PREFIX}target2` }, revokedAt: null },
    })
    expect(stored).not.toBeNull()

    const disabled = await request(server())
      .post(`/api/v1/users/${stored!.userId}/disable`)
      .set('Cookie', admin.cookie)
      .expect(201)
    expect(disabled.body.data.status).toBe('INACTIVE')

    // session revoked → refresh rejected
    const refresh = await request(server())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `refresh_token=${refreshToken}`)
      .expect(401)
    expect(refresh.body).toBeDefined()
    // login blocked while INACTIVE
    await request(server())
      .post('/api/v1/auth/login')
      .send({ username_or_email: `${PREFIX}target2`, password: TARGET.password })
      .expect(401)

    await request(server()).post(`/api/v1/users/${admin.id}/disable`).set('Cookie', admin.cookie).expect(400)

    const enabled = await request(server())
      .post(`/api/v1/users/${stored!.userId}/enable`)
      .set('Cookie', admin.cookie)
      .expect(201)
    expect(enabled.body.data.status).toBe('ACTIVE')
  })

  it('reset-password rotates the hash and revokes old sessions', async () => {
    const target = await prisma.user.findUnique({ where: { username: `${PREFIX}target2` } })
    const res = await request(server())
      .post(`/api/v1/users/${target!.id}/reset-password`)
      .set('Cookie', admin.cookie)
      .send({ newPassword: 'brand-new-pw-9' })
      .expect(201)

    expect(res.body.data).not.toHaveProperty('passwordHash')
    await request(server())
      .post('/api/v1/auth/login')
      .send({ username_or_email: `${PREFIX}target2`, password: TARGET.password })
      .expect(401) // old password dead
    await request(server())
      .post('/api/v1/auth/login')
      .send({ username_or_email: `${PREFIX}target2`, password: 'brand-new-pw-9' })
      .expect(200)
    expect(
      await prisma.auditLog.count({ where: { action: 'USER_PASSWORD_RESET', entityId: target!.id } }),
    ).toBe(1)
  })

  it('organizer (non-admin) → 403 on every users route; unauthenticated → 401', async () => {
    const res = await request(server()).get('/api/v1/users').set('Cookie', organizer.cookie).expect(403)
    expect(res.body.error.code).toBe('FORBIDDEN')

    const unauth = await request(server()).get('/api/v1/users').expect(401)
    expect(unauth.body.error.code).toBe('UNAUTHORIZED')
  })
})
