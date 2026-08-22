import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { hash } from 'argon2'
import request from 'supertest'
import { AppModule } from '../../app.module'
import { configureApp } from '../../app.setup'
import { UserRole } from '../../generated/prisma/client'
import { PrismaService } from '../../prisma/prisma.service'

const TEST_USER = {
  email: 'itest-admin@example.com',
  username: 'itest-admin',
  password: 'itest-password-1',
}

/** Normalizes a response's Set-Cookie header(s) into an array. */
function setCookiesOf(res: request.Response): string[] {
  const header = res.headers['set-cookie']
  if (Array.isArray(header)) return header as string[]
  return typeof header === 'string' ? [header] : []
}

/** Extracts the raw "name=value" pair of `name` from a Set-Cookie array. */
function cookieValue(setCookie: string[] | string, name: string): string | undefined {
  const list = Array.isArray(setCookie) ? setCookie : [setCookie]
  for (const c of list) {
    if (c.startsWith(`${name}=`)) return c.split(';')[0]
  }
  return undefined
}

describe('Auth (integration)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let setCookies: string[] // cookies of the shared login session from beforeAll
  let accessCookie: string
  let refreshCookie: string

  const server = () => app.getHttpServer()

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    configureApp(app)
    await app.init()
    prisma = app.get(PrismaService)

    await prisma.refreshToken.deleteMany({ where: { user: { email: TEST_USER.email } } })
    await prisma.user.deleteMany({ where: { email: TEST_USER.email } })
    await prisma.user.create({
      data: {
        email: TEST_USER.email,
        username: TEST_USER.username,
        passwordHash: await hash(TEST_USER.password),
        role: UserRole.ADMIN,
      },
    })

    const res = await request(server())
      .post('/api/v1/auth/login')
      .send({ username_or_email: TEST_USER.username, password: TEST_USER.password })
      .expect(200)
    setCookies = setCookiesOf(res)
    accessCookie = cookieValue(setCookies, 'access_token') ?? ''
    refreshCookie = cookieValue(setCookies, 'refresh_token') ?? ''
  })

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { user: { email: TEST_USER.email } } })
    await prisma.user.deleteMany({ where: { email: TEST_USER.email } })
    await app.close()
  })

  it('login returns the profile envelope and sets httpOnly cookies', async () => {
    // body asserted from the shared beforeAll login response
    expect(setCookies.join('\n')).toContain('access_token=')
    expect(setCookies.join('\n')).toContain('refresh_token=')
    expect(setCookies.join('\n')).toContain('HttpOnly')
    expect(setCookies.join('\n')).toContain('Path=/api/v1')
    expect(setCookies.join('\n')).toContain('SameSite=Lax')
    // sanity: refresh token is an opaque hex string, not a JWT (no dots)
    expect(refreshCookie.split('=')[1]).toMatch(/^[0-9a-f]{96}$/)
  })

  it('login response envelope contains the user profile', async () => {
    const res = await request(server())
      .post('/api/v1/auth/login')
      .send({ username_or_email: TEST_USER.email, password: TEST_USER.password })
      .expect(200)
    expect(res.body).toEqual({
      success: true,
      data: { id: expect.any(String), email: TEST_USER.email, username: TEST_USER.username, role: 'ADMIN' },
    })
  })

  it('login with wrong password → 401 envelope, generic Thai message', async () => {
    const res = await request(server())
      .post('/api/v1/auth/login')
      .send({ username_or_email: TEST_USER.username, password: 'wrong-password' })
      .expect(401)
    expect(res.body).toEqual({ success: false, error: { code: 'UNAUTHORIZED', message: expect.any(String) } })
  })

  it('login with unknown user → same generic message as wrong password (no enumeration)', async () => {
    const wrongPassword = await request(server())
      .post('/api/v1/auth/login')
      .send({ username_or_email: TEST_USER.username, password: 'wrong-password' })
    const unknownUser = await request(server())
      .post('/api/v1/auth/login')
      .send({ username_or_email: 'no-such-user', password: 'whatever-pass' })
    expect(unknownUser.status).toBe(401)
    expect(unknownUser.body.error.message).toBe(wrongPassword.body.error.message)
  })

  it('login with missing fields → 400 VALIDATION_ERROR envelope', async () => {
    const res = await request(server())
      .post('/api/v1/auth/login')
      .send({ username_or_email: TEST_USER.username })
      .expect(400)
    expect(res.body).toEqual({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: expect.stringContaining('password') },
    })
  })

  it('GET /auth/me without a token → 401 envelope', async () => {
    const res = await request(server()).get('/api/v1/auth/me').expect(401)
    expect(res.body).toEqual({
      success: false,
      error: { code: 'UNAUTHORIZED', message: expect.any(String) },
    })
  })

  it('GET /auth/me with a tampered access token → 401 envelope', async () => {
    await request(server())
      .get('/api/v1/auth/me')
      .set('Cookie', `access_token=${accessCookie.split('=')[1]}tampered`)
      .expect(401)
  })

  it('GET /auth/me with the access cookie → profile envelope', async () => {
    const res = await request(server()).get('/api/v1/auth/me').set('Cookie', accessCookie).expect(200)
    expect(res.body).toEqual({
      success: true,
      data: { id: expect.any(String), email: TEST_USER.email, username: TEST_USER.username, role: 'ADMIN' },
    })
  })

  it('POST /auth/refresh rotates the refresh token — old one becomes unusable', async () => {
    const rotated = await request(server()).post('/api/v1/auth/refresh').set('Cookie', refreshCookie).expect(200)
    expect(rotated.body.success).toBe(true)
    const newRefresh = cookieValue(setCookiesOf(rotated), 'refresh_token')
    expect(newRefresh).toBeDefined()
    expect(newRefresh).not.toEqual(refreshCookie)

    // old refresh token was revoked by rotation
    await request(server()).post('/api/v1/auth/refresh').set('Cookie', refreshCookie).expect(401)
    // the new one works
    await request(server()).post('/api/v1/auth/refresh').set('Cookie', newRefresh!).expect(200)
  })

  it('POST /auth/refresh with an unknown token → 401 envelope', async () => {
    const res = await request(server())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `refresh_token=${'ab'.repeat(48)}`)
      .expect(401)
    expect(res.body).toEqual({
      success: false,
      error: { code: 'UNAUTHORIZED', message: expect.any(String) },
    })
  })

  it('POST /auth/logout revokes the refresh token, clears cookies, is idempotent', async () => {
    const login = await request(server())
      .post('/api/v1/auth/login')
      .send({ username_or_email: TEST_USER.username, password: TEST_USER.password })
      .expect(200)
    const cookies = setCookiesOf(login)
      .map((c) => c.split(';')[0])
      .join('; ')
    const refresh = cookieValue(setCookiesOf(login), 'refresh_token')!

    const logout = await request(server()).post('/api/v1/auth/logout').set('Cookie', cookies).expect(200)
    expect(logout.body).toEqual({ success: true, data: null })
    // both cookies are cleared (Set-Cookie with expiry in the past)
    const cleared = setCookiesOf(logout)
    expect(cleared.join('\n')).toContain('access_token=;')
    expect(cleared.join('\n')).toContain('refresh_token=;')

    // refresh after logout fails
    await request(server()).post('/api/v1/auth/refresh').set('Cookie', refresh).expect(401)

    // logging out again without cookies is still 200
    await request(server()).post('/api/v1/auth/logout').expect(200)
  })

  it('GET /health is public and enveloped', async () => {
    const res = await request(server()).get('/api/v1/health').expect(200)
    expect(res.body).toEqual({ success: true, data: { status: 'ok' } })
  })
})

describe('Login throttling (integration)', () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    configureApp(app)
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('returns 429 RATE_LIMITED envelope after 10 login attempts from one IP', async () => {
    // separate app instance → fresh in-memory throttler storage, isolated from the suite above
    const body = { username_or_email: 'ghost-user', password: 'ghost-password' }
    for (let i = 0; i < 10; i++) {
      await request(app.getHttpServer()).post('/api/v1/auth/login').send(body).expect(401)
    }
    const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send(body).expect(429)
    expect(res.body).toEqual({
      success: false,
      error: { code: 'RATE_LIMITED', message: expect.any(String) },
    })
  })
})
