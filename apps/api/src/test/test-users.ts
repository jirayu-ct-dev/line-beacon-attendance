import { INestApplication } from '@nestjs/common'
import { hash } from 'argon2'
import request from 'supertest'
import { UserRole } from '../generated/prisma/client'
import { PrismaService } from '../prisma/prisma.service'

/**
 * Seed helper for integration tests: creates a user (admin or organizer) and
 * logs them in, returning the `access_token` cookie for authenticated requests.
 */
export interface TestUser {
  id: string
  email: string
  /** Value for the `Cookie` header, e.g. `access_token=<jwt>` */
  cookie: string
}

export async function createTestUser(
  app: INestApplication,
  prisma: PrismaService,
  options: { email: string; username: string; password: string; role: UserRole },
): Promise<TestUser> {
  const { password, ...user } = options
  const created = await prisma.user.create({
    data: { ...user, passwordHash: await hash(password) },
    select: { id: true, email: true },
  })

  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ username_or_email: options.username, password: options.password })
    .expect(200)
  const setCookies = res.headers['set-cookie']
  const cookies = Array.isArray(setCookies) ? setCookies : typeof setCookies === 'string' ? [setCookies] : []
  const accessToken = cookies.find((c) => c.startsWith('access_token='))
  return { id: created.id, email: created.email, cookie: accessToken!.split(';')[0] }
}

/** Removes a test user and everything referencing it (audit logs, refresh tokens). */
export async function deleteTestUser(prisma: PrismaService, email: string): Promise<void> {
  await prisma.auditLog.deleteMany({ where: { user: { email } } })
  await prisma.refreshToken.deleteMany({ where: { user: { email } } })
  await prisma.user.deleteMany({ where: { email } })
}
