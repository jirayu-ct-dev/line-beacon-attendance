import { createHmac } from 'node:crypto'
import { Server } from 'node:http'
import request from 'supertest'
import { TEST_LINE_CHANNEL_SECRET } from './setup-env'

/**
 * LINE webhook test helper (design doc §10). Builds real-shaped beacon events
 * per spec §9 and signs request bodies exactly like the LINE platform does:
 * `x-line-signature` = base64(HMAC-SHA256(channelSecret, rawBody)).
 *
 * The secret comes from setup-env.ts, which runs before AppModule is imported
 * so ConfigService hands the same value to the webhook service.
 */
export { TEST_LINE_CHANNEL_SECRET }

/** Registered in the spec's seed; 10 hex chars like a real LINE hwid (spec §9). */
export const REGISTERED_HWID = '0123456789'
/** 10 hex chars, never registered — the UNKNOWN_BEACON case (spec §40). */
export const UNKNOWN_HWID = 'ffffffffff'

export type BeaconEventType = 'enter' | 'banner' | 'stay'

/** Webhook beacon event exactly as LINE sends it (spec §9). */
export interface TestBeaconEvent {
  type: 'beacon'
  webhookEventId: string
  deliveryContext: { isRedelivery: boolean }
  replyToken: string
  source: { type: 'user'; userId: string }
  beacon: { hwid: string; type: BeaconEventType; dm?: string }
  timestamp: number
}

export function buildBeaconEvent(overrides: Partial<TestBeaconEvent> = {}): TestBeaconEvent {
  return {
    type: 'beacon',
    webhookEventId: '01F8PHKJVFYQZR8A4RQXQXZXTV',
    deliveryContext: { isRedelivery: false },
    replyToken: 'nHuyWiB7yP5ZwvFI1skX6bTestReplyToken',
    source: { type: 'user', userId: 'UtestwhUser0001' },
    timestamp: 1755849600000,
    ...overrides,
    beacon: { hwid: REGISTERED_HWID, type: 'enter', dm: '303034303032', ...overrides.beacon },
  }
}

/** The full webhook body LINE POSTs: { destination, events } (spec §9 context). */
export function buildWebhookBody(events: TestBeaconEvent[]): Buffer {
  return Buffer.from(JSON.stringify({ destination: 'UtestwhDestination', events }), 'utf8')
}

/** `x-line-signature` for an exact request body (HMAC-SHA256, base64). */
export function signBody(body: Buffer, secret: string = TEST_LINE_CHANNEL_SECRET): string {
  return createHmac('sha256', secret).update(body).digest('base64')
}

/** POSTs raw bytes + signature to the webhook endpoint. */
export function postWebhook(server: Server, body: Buffer, signature: string) {
  return request(server)
    .post('/api/v1/line/webhook')
    .set('Content-Type', 'application/json')
    .set('x-line-signature', signature)
    // Send the JSON as a string: superagent re-serializes Buffer payloads with
    // JSON.stringify ({"type":"Buffer",...}), which would break the signature.
    .send(body.toString('utf8'))
}

/** Convenience: build the body for `events`, sign it with the test secret, POST. */
export function postEvents(server: Server, events: TestBeaconEvent[], secret: string = TEST_LINE_CHANNEL_SECRET) {
  const body = buildWebhookBody(events)
  return postWebhook(server, body, signBody(body, secret))
}
