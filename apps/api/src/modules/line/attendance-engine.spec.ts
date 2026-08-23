import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { messagingApi } from '@line/bot-sdk'
import { AppModule } from '../../app.module'
import { configureApp } from '../../app.setup'
import { PrismaService } from '../../prisma/prisma.service'
import { buildBeaconEvent, postEvents } from '../../test/line-webhook-helper'
import { checkinSuccessMessage, LINE_MESSAGES } from './line-messages'
import { LINE_MESSAGING_CLIENT } from './line-notification.service'
import { LineWebhookService } from './line-webhook.service'

// Attendance engine E2E (spec §10, §15–§17, §37, §38): a signed webhook is the
// only entry — everything below is asserted through its real side effects.

const LINE_USER = 'Utesteng01'
const CODE_PREFIX = '669966'
const HWID = 'beefcafe01'
const ACTIVITY_NAME = 'Engine Test Workshop'

// Fixed event time: 2025-08-22T08:00:00.000Z (the helper's default timestamp).
const EVENT_TS = new Date(1755849600000)
// Window around EVENT_TS: open 07:00, late 08:10, close 08:30, end 10:00 —
// PRESENT at 08:00, LATE at 08:20, outside before 07:00 / after 08:30.
const T = (h: number, m = 0): Date => new Date(Date.UTC(2025, 7, 22, h, m, 0))

const event = (n: number, overrides: Parameters<typeof buildBeaconEvent>[0] = {}) =>
  buildBeaconEvent({
    webhookEventId: `eng-event-${String(n).padStart(4, '0')}`,
    replyToken: `eng-reply-${n}`,
    ...overrides,
    source: { type: 'user', userId: LINE_USER },
    // the helper defaults to its own REGISTERED_HWID — force this spec's hwid
    beacon: { hwid: HWID, type: 'enter', ...overrides.beacon },
  })

describe('Attendance engine (integration)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let webhooks: LineWebhookService
  let lineClient: { replyMessage: jest.Mock; pushMessage: jest.Mock }

  const server = () => app.getHttpServer()
  const drain = () => webhooks.drain()
  const logByWebhookId = (id: string) => prisma.beaconLog.findUnique({ where: { webhookEventId: id } })
  const attendanceCount = () => prisma.attendance.count()

  let studentId: string
  let beaconId: string
  let activityId: string
  let ownerId: string

  beforeAll(async () => {
    lineClient = { replyMessage: jest.fn(async () => ({})), pushMessage: jest.fn(async () => ({})) }
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(LINE_MESSAGING_CLIENT)
      .useValue(lineClient as unknown as messagingApi.MessagingApiClient)
      .compile()
    app = moduleRef.createNestApplication({ rawBody: true })
    configureApp(app)
    await app.init()
    prisma = app.get(PrismaService)
    webhooks = app.get(LineWebhookService)

    await cleanup()
    const owner = await prisma.user.create({
      data: { email: 'itest-eng-owner@example.com', username: 'itest-eng-owner', passwordHash: 'x', role: 'ORGANIZER' },
      select: { id: true },
    })
    ownerId = owner.id
    const student = await prisma.student.create({
      data: {
        studentCode: `${CODE_PREFIX}000001`,
        firstName: 'Engine',
        lastName: 'Test',
        birthDate: new Date('2004-01-01'),
        year: 3,
      },
      select: { id: true },
    })
    studentId = student.id
    await prisma.lineAccount.create({ data: { studentId, lineUserId: LINE_USER } })
    const beacon = await prisma.beacon.create({ data: { hwid: HWID, name: 'Engine Beacon' }, select: { id: true } })
    beaconId = beacon.id
    const activity = await prisma.activity.create({
      data: {
        name: ACTIVITY_NAME,
        createdBy: ownerId,
        status: 'PUBLISHED',
        checkinOpenAt: T(7),
        lateAt: T(8, 10),
        checkinCloseAt: T(8, 30),
        startAt: T(8),
        endAt: T(10),
      },
      select: { id: true },
    })
    activityId = activity.id
    await prisma.activityBeacon.create({ data: { activityId, beaconId } })
  })

  async function cleanup(): Promise<void> {
    // ownerId is undefined on the first (pre-seed) call — never let an
    // undefined field widen a deleteMany into matching every row.
    await prisma.notification.deleteMany({ where: { student: { studentCode: { startsWith: CODE_PREFIX } } } })
    await prisma.attendance.deleteMany({ where: { student: { studentCode: { startsWith: CODE_PREFIX } } } })
    await prisma.beaconLog.deleteMany({ where: { lineUserId: LINE_USER } })
    if (ownerId) {
      await prisma.activityBeacon.deleteMany({
        where: { OR: [{ beacon: { hwid: HWID } }, { activity: { createdBy: ownerId } }] },
      })
      await prisma.activity.deleteMany({ where: { createdBy: ownerId } })
      await prisma.user.deleteMany({ where: { id: ownerId } })
    } else {
      await prisma.activityBeacon.deleteMany({ where: { beacon: { hwid: HWID } } })
    }
    await prisma.lineAccount.deleteMany({ where: { lineUserId: LINE_USER } })
    await prisma.beacon.deleteMany({ where: { hwid: HWID } })
    await prisma.student.deleteMany({ where: { studentCode: { startsWith: CODE_PREFIX } } })
  }

  beforeEach(async () => {
    // Isolate rows, cooldowns and mock counts between tests; restore the
    // statuses mutated by the beacon/activity cases.
    await prisma.notification.deleteMany({ where: { studentId } })
    await prisma.attendance.deleteMany({ where: { studentId } })
    await prisma.beaconLog.deleteMany({ where: { lineUserId: LINE_USER } })
    await prisma.beacon.update({ where: { id: beaconId }, data: { status: 'ACTIVE' } })
    await prisma.activity.update({ where: { id: activityId }, data: { status: 'PUBLISHED' } })
    lineClient.replyMessage.mockClear()
    lineClient.pushMessage.mockClear()
  })

  afterAll(async () => {
    await cleanup()
    await app.close()
  })

  // --- §16 PRESENT/LATE — event timestamp is the authoritative check-in time ---

  it('enter within [open, late] creates a PRESENT attendance with the EVENT timestamp as check_in_at', async () => {
    const res = await postEvents(server(), [event(1, { timestamp: T(8).getTime() })])
    expect(res.status).toBe(200)
    await drain()

    const row = await prisma.attendance.findUnique({
      where: { activityId_studentId: { activityId, studentId } },
    })
    expect(row).toMatchObject({
      status: 'PRESENT',
      checkinMethod: 'BEACON',
      beaconId,
      checkInAt: EVENT_TS, // §16: never the server receive time
    })

    expect(await logByWebhookId('eng-event-0001')).toMatchObject({
      processingStatus: 'PROCESSED',
      studentId,
      beaconId,
    })
    // §20 success message via reply token first
    expect(lineClient.replyMessage).toHaveBeenCalledTimes(1)
    expect(lineClient.replyMessage.mock.calls[0][0].messages[0].text).toBe(
      checkinSuccessMessage(ACTIVITY_NAME, EVENT_TS, 'PRESENT'),
    )
    expect(lineClient.pushMessage).not.toHaveBeenCalled()
    await expect(
      prisma.notification.findFirstOrThrow({ where: { studentId, type: 'PRESENT' } }),
    ).resolves.toMatchObject({ status: 'SENT', activityId })
  })

  it('enter in (late, close] creates a LATE attendance with the มาสาย message', async () => {
    const ts = T(8, 20)
    await postEvents(server(), [event(2, { timestamp: ts.getTime() })])
    await drain()

    const row = await prisma.attendance.findUnique({
      where: { activityId_studentId: { activityId, studentId } },
    })
    expect(row).toMatchObject({ status: 'LATE', checkInAt: ts })
    expect(lineClient.replyMessage.mock.calls[0][0].messages[0].text).toBe(
      checkinSuccessMessage(ACTIVITY_NAME, ts, 'LATE'),
    )
    expect(lineClient.replyMessage.mock.calls[0][0].messages[0].text).toContain('มาสาย')
  })

  it('a second enter event (new webhookEventId) is a DUPLICATE — no extra row, no repeat message (§17, §42)', async () => {
    await postEvents(server(), [
      event(3, { timestamp: T(8).getTime() }),
      event(4, { timestamp: T(8, 25).getTime() }),
    ])
    await drain()

    expect(await attendanceCount()).toBe(1)
    // The two events process concurrently (D1) — whichever create wins the
    // UNIQUE race is PROCESSED, the other lands in DUPLICATE (§17 backstop).
    const statuses = [await logByWebhookId('eng-event-0003'), await logByWebhookId('eng-event-0004')]
      .map((log) => log?.processingStatus)
      .sort()
    expect(statuses).toEqual(['DUPLICATE', 'PROCESSED'])
    expect(lineClient.replyMessage).toHaveBeenCalledTimes(1) // only the winning success (§42)
  })

  // --- §16/§55 outside the window ------------------------------------------------

  it.each([
    ['too early', T(6), 'eng-event-0010'],
    ['past close', T(9), 'eng-event-0011'],
  ])('enter %s → OUTSIDE_CHECKIN_WINDOW, no attendance, cooldown-style message', async (_label, ts, webhookId) => {
    await postEvents(server(), [event(5, { webhookEventId: webhookId, timestamp: (ts as Date).getTime() })])
    await drain()

    expect(await attendanceCount()).toBe(0)
    expect(await logByWebhookId(webhookId)).toMatchObject({ processingStatus: 'OUTSIDE_CHECKIN_WINDOW' })
    expect(lineClient.replyMessage).toHaveBeenCalledTimes(1)
    expect(lineClient.replyMessage.mock.calls[0][0].messages[0].text).toBe(LINE_MESSAGES.OUTSIDE_CHECKIN_WINDOW)
  })

  // --- §31/§38 eligibility edges ---------------------------------------------------

  it('an INACTIVE beacon serves no check-ins → NO_ACTIVE_ACTIVITY', async () => {
    await prisma.beacon.update({ where: { id: beaconId }, data: { status: 'INACTIVE' } })
    await postEvents(server(), [event(6, { timestamp: T(8).getTime() })])
    await drain()

    expect(await attendanceCount()).toBe(0)
    expect(await logByWebhookId('eng-event-0006')).toMatchObject({ processingStatus: 'NO_ACTIVE_ACTIVITY' })
    expect(lineClient.replyMessage.mock.calls[0][0].messages[0].text).toBe(LINE_MESSAGES.NO_ACTIVE_ACTIVITY)
  })

  it('a CANCELLED activity is not eligible → NO_ACTIVE_ACTIVITY (spec §55)', async () => {
    await prisma.activity.update({ where: { id: activityId }, data: { status: 'CANCELLED' } })
    await postEvents(server(), [event(7, { timestamp: T(8).getTime() })])
    await drain()

    expect(await attendanceCount()).toBe(0)
    expect(await logByWebhookId('eng-event-0007')).toMatchObject({ processingStatus: 'NO_ACTIVE_ACTIVITY' })
  })

  it('two PUBLISHED activities sharing the beacon with overlapping windows → ERROR, no attendance (§38)', async () => {
    // Seed directly, bypassing the publish-time overlap guard this rule backs up
    const overlapping = await prisma.activity.create({
      data: {
        name: 'Overlapping Workshop',
        createdBy: ownerId,
        status: 'PUBLISHED',
        checkinOpenAt: T(7, 30),
        lateAt: T(8, 15),
        checkinCloseAt: T(9),
        startAt: T(8),
        endAt: T(11),
      },
      select: { id: true },
    })
    await prisma.activityBeacon.create({ data: { activityId: overlapping.id, beaconId } })

    await postEvents(server(), [event(8, { timestamp: T(8).getTime() })])
    await drain()

    expect(await attendanceCount()).toBe(0)
    expect(await logByWebhookId('eng-event-0008')).toMatchObject({ processingStatus: 'ERROR' })
    expect(lineClient.replyMessage).not.toHaveBeenCalled()
  })
})
