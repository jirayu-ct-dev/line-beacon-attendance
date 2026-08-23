import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../../app.module'
import { configureApp } from '../../app.setup'
import { UserRole } from '../../generated/prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { createTestUser, deleteTestUser, TestUser } from '../../test/test-users'

const ADMIN = { email: 'itest-audit-admin@example.com', username: 'itest-audit-admin', password: 'itest-pw-1' }
const ORGANIZER = { email: 'itest-audit-org@example.com', username: 'itest-audit-org', password: 'itest-pw-1' }

const ENTITY_ID = 'itest-audit-entity-1'

describe('AuditLogs (integration)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let admin: TestUser
  let organizer: TestUser
  let rowId: string

  const server = () => app.getHttpServer()

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    configureApp(app)
    await app.init()
    prisma = app.get(PrismaService)

    await cleanup()
    admin = await createTestUser(app, prisma, { ...ADMIN, role: UserRole.ADMIN })
    organizer = await createTestUser(app, prisma, { ...ORGANIZER, role: UserRole.ORGANIZER })

    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: 'STUDENT_CREATED',
        entityType: 'STUDENT',
        entityId: ENTITY_ID,
        newValue: { student_code: '1' },
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    })
    const second = await prisma.auditLog.create({
      data: {
        userId: null, // student self-service (spec §56)
        action: 'LINE_ACCOUNT_LINKED',
        entityType: 'LINE_ACCOUNT',
        entityId: ENTITY_ID,
        newValue: { line_user_id: 'U...' },
        createdAt: new Date('2026-01-02T00:00:00Z'),
      },
      select: { id: true },
    })
    rowId = second.id
  })

  async function cleanup(): Promise<void> {
    await prisma.auditLog.deleteMany({ where: { entityId: ENTITY_ID } })
    for (const user of [ADMIN, ORGANIZER]) await deleteTestUser(prisma, user.email)
  }

  afterAll(async () => {
    await cleanup()
    await app.close()
  })

  it('lists newest first with the actor resolved (null for self-service rows)', async () => {
    const res = await request(server()).get('/api/v1/audit-logs').set('Cookie', admin.cookie).expect(200)
    const rows = res.body.data.items.filter((r: { entityId: string }) => r.entityId === ENTITY_ID)
    expect(rows.map((r: { action: string }) => r.action)).toEqual(['LINE_ACCOUNT_LINKED', 'STUDENT_CREATED'])
    expect(rows[1]).toMatchObject({ user: { username: ADMIN.username }, entityType: 'STUDENT' })
    expect(rows[0].user).toBeNull()
  })

  it('filters by action and rejects unknown actions', async () => {
    const byAction = await request(server())
      .get('/api/v1/audit-logs?action=STUDENT_CREATED')
      .set('Cookie', admin.cookie)
      .expect(200)
    expect(byAction.body.data.items.every((r: { action: string }) => r.action === 'STUDENT_CREATED')).toBe(true)

    await request(server()).get('/api/v1/audit-logs?action=NOT_A_REAL_ACTION').set('Cookie', admin.cookie).expect(400)
  })

  it('detail returns the old/new snapshots', async () => {
    const res = await request(server()).get(`/api/v1/audit-logs/${rowId}`).set('Cookie', admin.cookie).expect(200)
    expect(res.body.data).toMatchObject({ id: rowId, action: 'LINE_ACCOUNT_LINKED' })
    expect(res.body.data.newValue).toMatchObject({ line_user_id: 'U...' })
    expect(res.body.data.oldValue).toBeNull()

    await request(server()).get('/api/v1/audit-logs/no-such-id').set('Cookie', admin.cookie).expect(404)
  })

  it('organizer → 403; unauthenticated → 401', async () => {
    await request(server()).get('/api/v1/audit-logs').set('Cookie', organizer.cookie).expect(403)
    const res = await request(server()).get('/api/v1/audit-logs').expect(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })
})
