import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { messagingApi } from '@line/bot-sdk'
import request from 'supertest'
import { AppModule } from '../../app.module'
import { configureApp } from '../../app.setup'
import { PrismaService } from '../../prisma/prisma.service'
import {
  REGISTERED_HWID,
  UNKNOWN_HWID,
  buildBeaconEvent,
  buildWebhookBody,
  postEvents,
  postWebhook,
  signBody,
} from '../../test/line-webhook-helper'
import { BeaconEventService } from './beacon-event.service'
import { LINE_MESSAGES } from './line-messages'
import { LINE_MESSAGING_CLIENT } from './line-notification.service'
import { LineWebhookService } from './line-webhook.service'

// LINE_CHANNEL_SECRET is set from setup-env.ts (before AppModule import);
// the helper signs with the same value.

// All LINE user ids created by this spec share this prefix.
const USER_PREFIX = 'Utestwh'
const CODE_PREFIX = '669977' // student codes 669977xxxxxx

const event = (n: number, overrides: Partial<ReturnType<typeof buildBeaconEvent>> = {}) =>
  buildBeaconEvent({
    webhookEventId: `wh-event-${String(n).padStart(4, '0')}`,
    replyToken: `reply-token-${n}`,
    ...overrides,
  })

describe('LINE webhook (integration)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let webhooks: LineWebhookService
  let beaconEvents: BeaconEventService
  let lineClient: { replyMessage: jest.Mock; pushMessage: jest.Mock }

  const server = () => app.getHttpServer()
  const drain = () => webhooks.drain()

  const beaconLogByWebhookId = (webhookEventId: string) =>
    prisma.beaconLog.findUnique({ where: { webhookEventId } })

  beforeAll(async () => {
    // Mock MessagingApiClient via the DI token — tests never touch the network.
    lineClient = {
      replyMessage: jest.fn(async () => ({})),
      pushMessage: jest.fn(async () => ({})),
    }

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(LINE_MESSAGING_CLIENT)
      .useValue(lineClient as unknown as messagingApi.MessagingApiClient)
      .compile()
    // rawBody must be enabled exactly like main.ts does — the signature is
    // verified over the raw bytes.
    app = moduleRef.createNestApplication({ rawBody: true })
    configureApp(app)
    await app.init()
    prisma = app.get(PrismaService)
    webhooks = app.get(LineWebhookService)
    beaconEvents = app.get(BeaconEventService)

    await seed()
  })

  /** Two linked students (the notification-failure test needs a second one) + one beacon. */
  let studentId: string
  let studentId2: string
  let beaconId: string
  async function seed(): Promise<void> {
    await cleanup()
    const beacon = await prisma.beacon.create({
      data: { hwid: REGISTERED_HWID, name: 'Test Beacon', location: 'Lab' },
      select: { id: true },
    })
    beaconId = beacon.id
    for (const [n, lineUserId] of [[1, 'UtestwhLinked01'], [2, 'UtestwhLinked02']] as const) {
      const student = await prisma.student.create({
        data: {
          studentCode: `${CODE_PREFIX}${String(n).padStart(6, '0')}`,
          firstName: 'Wichai',
          lastName: 'Test',
          birthDate: new Date('2004-05-05'),
          year: 3,
        },
        select: { id: true },
      })
      await prisma.lineAccount.create({ data: { studentId: student.id, lineUserId } })
      if (n === 1) studentId = student.id
      else studentId2 = student.id
    }
  }

  async function cleanup(): Promise<void> {
    await prisma.notification.deleteMany({ where: { student: { studentCode: { startsWith: CODE_PREFIX } } } })
    await prisma.beaconLog.deleteMany({ where: { lineUserId: { startsWith: USER_PREFIX } } })
    await prisma.lineAccount.deleteMany({ where: { lineUserId: { startsWith: USER_PREFIX } } })
    await prisma.beacon.deleteMany({ where: { hwid: REGISTERED_HWID } })
    await prisma.student.deleteMany({ where: { studentCode: { startsWith: CODE_PREFIX } } })
  }

  beforeEach(async () => {
    // Isolate cooldowns and mock call counts between tests.
    await prisma.notification.deleteMany({ where: { student: { studentCode: { startsWith: CODE_PREFIX } } } })
    await prisma.beaconLog.deleteMany({ where: { lineUserId: { startsWith: USER_PREFIX } } })
    lineClient.replyMessage.mockClear()
    lineClient.pushMessage.mockClear()
  })

  afterAll(async () => {
    await cleanup()
    await app.close()
  })

  it('accepts a signed enter event from a linked student at a known beacon (NO_ACTIVE_ACTIVITY — no eligible activity for the beacon)', async () => {
    const res = await postEvents(server(), [event(1, { source: { type: 'user', userId: 'UtestwhLinked01' } })])
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, data: null })
    await drain()

    const log = await beaconLogByWebhookId('wh-event-0001')
    expect(log).toMatchObject({
      lineUserId: 'UtestwhLinked01',
      hwid: REGISTERED_HWID,
      eventType: 'enter',
      processingStatus: 'NO_ACTIVE_ACTIVITY',
      studentId,
      beaconId,
      eventTimestamp: new Date(1755849600000),
    })
    expect(log?.rawPayload).toMatchObject({ webhookEventId: 'wh-event-0001' })

    // Notification attempted via reply first (spec §20).
    expect(lineClient.replyMessage).toHaveBeenCalledTimes(1)
    expect(lineClient.replyMessage.mock.calls[0][0]).toMatchObject({
      replyToken: 'reply-token-1',
      messages: [{ type: 'text', text: LINE_MESSAGES.NO_ACTIVE_ACTIVITY }],
    })
    expect(lineClient.pushMessage).not.toHaveBeenCalled()
    await expect(prisma.notification.findFirstOrThrow({ where: { studentId } })).resolves.toMatchObject({
      type: 'NO_ACTIVE_ACTIVITY',
      channel: 'LINE',
      status: 'SENT',
      sentAt: expect.any(Date),
      message: LINE_MESSAGES.NO_ACTIVE_ACTIVITY,
    })
  })

  it('rejects an invalid or missing signature with 401 and writes no beacon log', async () => {
    const body = buildWebhookBody([event(2, { source: { type: 'user', userId: 'UtestwhLinked01' } })])

    const badSecret = await postWebhook(server(), body, signBody(body, 'wrong-secret'))
    expect(badSecret.status).toBe(401)
    expect(badSecret.body.error.code).toBe('INVALID_LINE_SIGNATURE')

    const noHeader = await request(server()).post('/api/v1/line/webhook').set('Content-Type', 'application/json').send(body)
    expect(noHeader.status).toBe(401)

    expect(await prisma.beaconLog.count({ where: { lineUserId: { startsWith: USER_PREFIX } } })).toBe(0)
  })

  it('marks an unlinked LINE user as UNKNOWN_USER, replies the register hint, records no notifications row', async () => {
    await postEvents(server(), [event(3, { source: { type: 'user', userId: 'UtestwhStranger' } })])
    await drain()

    const log = await beaconLogByWebhookId('wh-event-0003')
    expect(log).toMatchObject({ processingStatus: 'UNKNOWN_USER', studentId: null, beaconId: null })

    expect(lineClient.replyMessage).toHaveBeenCalledTimes(1)
    expect(lineClient.replyMessage.mock.calls[0][0].messages[0].text).toBe(LINE_MESSAGES.UNKNOWN_USER)
    // notifications.student_id is NOT NULL (spec §33) — no row possible for an
    // unknown user; the outcome lives in the application log instead.
    expect(await prisma.notification.count({ where: { student: { studentCode: { startsWith: CODE_PREFIX } } } })).toBe(0)
  })

  it('marks an unregistered hwid as UNKNOWN_BEACON and sends no LINE message', async () => {
    await postEvents(server(), [
      event(4, {
        source: { type: 'user', userId: 'UtestwhLinked01' },
        beacon: { hwid: UNKNOWN_HWID, type: 'enter', dm: '303034303032' },
      }),
    ])
    await drain()

    const log = await beaconLogByWebhookId('wh-event-0004')
    expect(log).toMatchObject({ processingStatus: 'UNKNOWN_BEACON', studentId, beaconId: null })
    expect(lineClient.replyMessage).not.toHaveBeenCalled()
    expect(lineClient.pushMessage).not.toHaveBeenCalled()
  })

  it('skips a duplicate webhookEventId (identical body twice): one row, one notification', async () => {
    const body = buildWebhookBody([event(5, { source: { type: 'user', userId: 'UtestwhLinked01' } })])
    const signature = signBody(body)

    await postWebhook(server(), body, signature)
    await drain()
    await postWebhook(server(), body, signature) // byte-identical redelivery
    await drain()

    expect(await prisma.beaconLog.count({ where: { webhookEventId: 'wh-event-0005' } })).toBe(1)
    expect(lineClient.replyMessage).toHaveBeenCalledTimes(1)
    expect(await prisma.notification.count({ where: { studentId, type: 'NO_ACTIVE_ACTIVITY', status: 'SENT' } })).toBe(1)
  })

  it('processes a redelivered event with a NEW webhookEventId as a new event, but cooldown suppresses the second message (spec §42/§55)', async () => {
    const base = { source: { type: 'user' as const, userId: 'UtestwhLinked01' } }
    await postEvents(server(), [event(6, base)])
    await drain()
    // Same content, new id, deliveryContext.isRedelivery = true. Idempotency is
    // keyed on webhookEventId only — a new id must still be processed.
    await postEvents(server(), [event(7, { ...base, deliveryContext: { isRedelivery: true } })])
    await drain()

    expect(await beaconLogByWebhookId('wh-event-0006')).toMatchObject({ processingStatus: 'NO_ACTIVE_ACTIVITY' })
    expect(await beaconLogByWebhookId('wh-event-0007')).toMatchObject({ processingStatus: 'NO_ACTIVE_ACTIVITY' })
    // First message sent, second suppressed by the cooldown window (spec §42).
    expect(lineClient.replyMessage).toHaveBeenCalledTimes(1)
    expect(await prisma.notification.count({ where: { studentId, type: 'NO_ACTIVE_ACTIVITY', status: 'SENT' } })).toBe(1)
  })

  it('suppresses a repeated NO_ACTIVE_ACTIVITY message within the cooldown window', async () => {
    const base = { source: { type: 'user' as const, userId: 'UtestwhLinked01' } }
    await postEvents(server(), [event(8, base)])
    await drain()
    await postEvents(server(), [event(9, base)])
    await drain()

    expect(await prisma.beaconLog.count({ where: { studentId, processingStatus: 'NO_ACTIVE_ACTIVITY' } })).toBe(2)
    expect(lineClient.replyMessage).toHaveBeenCalledTimes(1)
    expect(lineClient.pushMessage).not.toHaveBeenCalled()
  })

  it('falls back to push when reply fails and records FAILED when both channels fail', async () => {
    // Reply token expired/used (spec §20): reply rejects, push delivers.
    lineClient.replyMessage.mockRejectedValueOnce(new Error('invalid reply token'))
    await postEvents(server(), [event(10, { source: { type: 'user', userId: 'UtestwhLinked01' } })])
    await drain()

    expect(lineClient.pushMessage).toHaveBeenCalledTimes(1)
    expect(lineClient.pushMessage.mock.calls[0][0]).toMatchObject({
      to: 'UtestwhLinked01',
      messages: [{ type: 'text', text: LINE_MESSAGES.NO_ACTIVE_ACTIVITY }],
    })
    await expect(
      prisma.notification.findFirstOrThrow({ where: { studentId, type: 'NO_ACTIVE_ACTIVITY' } }),
    ).resolves.toMatchObject({ status: 'SENT' })

    // Second student: both channels fail — the row must reflect the outcome.
    lineClient.replyMessage.mockRejectedValueOnce(new Error('reply failed'))
    lineClient.pushMessage.mockRejectedValueOnce(new Error('push failed'))
    await postEvents(server(), [event(11, { source: { type: 'user', userId: 'UtestwhLinked02' } })])
    await drain()

    await expect(
      prisma.notification.findFirstOrThrow({ where: { studentId: studentId2, type: 'NO_ACTIVE_ACTIVITY' } }),
    ).resolves.toMatchObject({ status: 'FAILED', errorMessage: expect.stringContaining('push failed') })
  })

  it('acks an empty events array with 200 and rejects malformed JSON with 400, writing no rows', async () => {
    const empty = await postEvents(server(), [])
    expect(empty.status).toBe(200)

    // Valid signature over the exact malformed bytes — parse must fail AFTER
    // signature verification, answering 400 without touching the DB.
    const malformed = Buffer.from('{"events": [not json', 'utf8')
    const bad = await postWebhook(server(), malformed, signBody(malformed))
    expect(bad.status).toBe(400)
    expect(bad.body.error.code).toBe('VALIDATION_ERROR')

    expect(await prisma.beaconLog.count({ where: { lineUserId: { startsWith: USER_PREFIX } } })).toBe(0)
  })

  it('still answers 200 and marks the log ERROR when processing throws (spec §36/§37.13)', async () => {
    const spy = jest.spyOn(beaconEvents, 'process').mockRejectedValueOnce(new Error('processing boom'))
    try {
      const res = await postEvents(server(), [event(12, { source: { type: 'user', userId: 'UtestwhLinked01' } })])
      expect(res.status).toBe(200)
      await drain()

      await expect(beaconLogByWebhookId('wh-event-0012')).resolves.toMatchObject({ processingStatus: 'ERROR' })
    } finally {
      spy.mockRestore()
    }
  })
})
