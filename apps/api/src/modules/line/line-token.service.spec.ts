import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { ConfigService } from '@nestjs/config'
import { exportJWK, generateKeyPair, SignJWT, type KeyLike } from 'jose'
import { LINE_OIDC_DISCOVERY_URL as LINE_DISCOVERY_URL, LineTokenService } from './line-token.service'

/**
 * LineTokenService unit tests — no network: a local HTTP server serves LINE's
 * discovery document + JWKS, and tokens are signed with a throwaway ES256 key.
 * Covers the claim checks the security of /line/link + /me rests on (spec §7.1:
 * the backend must verify the ID token — signature, iss, aud, exp).
 *
 * LINE's real discovery document (fetched 2026-08): issuer
 * "https://access.line.me", jwks_uri "https://api.line.me/oauth2/v2.1/certs",
 * id_token_signing_alg_values_supported ["ES256"].
 */

const CHANNEL_ID = '1650000000'

interface TestKeys {
  publicKey: KeyLike
  privateKey: KeyLike
  publicJwk: Record<string, unknown>
}

describe('LineTokenService (unit)', () => {
  let baseUrl: string
  let server: http.Server
  let keys: TestKeys
  let discoveryFailures: number

  const newService = () => new LineTokenService(new ConfigService({ LINE_LOGIN_CHANNEL_ID: CHANNEL_ID }), `${baseUrl}/.well-known/openid-configuration`)

  const signToken = (overrides: { iss?: string; aud?: string | string[]; exp?: string | number } = {}) =>
    new SignJWT({ name: 'สมชาย ทดสอบ', picture: 'https://example.test/pic.png' })
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
      .setSubject('Utesttoken01')
      .setIssuer(overrides.iss ?? 'https://access.line.me')
      .setAudience(overrides.aud ?? CHANNEL_ID)
      .setIssuedAt()
      .setExpirationTime(overrides.exp ?? '2m')
      .sign(keys.privateKey)

  const capture = async (promise: Promise<unknown>): Promise<Error & { code?: string; getStatus?: () => number }> =>
    (await promise.catch((error) => error)) as Error & { code?: string; getStatus?: () => number }

  beforeAll(async () => {
    const generated = await generateKeyPair('ES256')
    keys = {
      ...generated,
      publicJwk: { ...(await exportJWK(generated.publicKey)), kid: 'test-key', alg: 'ES256' },
    }
    discoveryFailures = 0

    const requestListener = (req: http.IncomingMessage, res: http.ServerResponse): void => {
      if (req.url === '/.well-known/openid-configuration') {
        if (discoveryFailures > 0) {
          discoveryFailures -= 1
          res.statusCode = 500
          res.end('upstream boom')
          return
        }
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ issuer: 'https://access.line.me', jwks_uri: `${baseUrl}/oauth2/v2.1/certs` }))
        return
      }
      if (req.url === '/oauth2/v2.1/certs') {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ keys: [keys.publicJwk] }))
        return
      }
      res.statusCode = 404
      res.end()
    }

    server = http.createServer(requestListener)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('returns 503 LINE_NOT_CONFIGURED when LINE_LOGIN_CHANNEL_ID is unset (same pattern as the 4a webhook secret)', async () => {
    // setup-env.ts sets LINE_LOGIN_CHANNEL_ID for the suite — hide it for this
    // one check (specs are serialized, maxWorkers: 1).
    const original = process.env.LINE_LOGIN_CHANNEL_ID
    delete process.env.LINE_LOGIN_CHANNEL_ID
    try {
      const service = new LineTokenService(new ConfigService(), `${baseUrl}/.well-known/openid-configuration`)
      const error = await capture(service.verifyIdToken('any-token'))
      expect(error.code).toBe('LINE_NOT_CONFIGURED')
      expect(error.getStatus?.()).toBe(503)
      expect(error.message).toContain('LINE_LOGIN_CHANNEL_ID')
    } finally {
      if (original) process.env.LINE_LOGIN_CHANNEL_ID = original
    }
  })

  it('verifies a valid token and extracts sub/name/picture', async () => {
    const payload = await newService().verifyIdToken(await signToken())
    expect(payload).toEqual({
      lineUserId: 'Utesttoken01',
      name: 'สมชาย ทดสอบ',
      picture: 'https://example.test/pic.png',
    })
  })

  it('accepts the legacy issuer https://line.me', async () => {
    const payload = await newService().verifyIdToken(await signToken({ iss: 'https://line.me' }))
    expect(payload.lineUserId).toBe('Utesttoken01')
  })

  it('rejects a token minted for another channel (wrong aud) with 401', async () => {
    const error = await capture(newService().verifyIdToken(await signToken({ aud: '9999999999' })))
    expect(error.getStatus?.()).toBe(401)
  })

  it('rejects a foreign issuer with 401', async () => {
    const error = await capture(newService().verifyIdToken(await signToken({ iss: 'https://evil.example' })))
    expect(error.getStatus?.()).toBe(401)
  })

  it('rejects an expired token with 401', async () => {
    const error = await capture(newService().verifyIdToken(await signToken({ exp: Math.floor(Date.now() / 1000) - 60 })))
    expect(error.getStatus?.()).toBe(401)
  })

  it('rejects a tampered token with 401', async () => {
    const token = await signToken()
    const [header, payload, signature] = token.split('.')
    const tamperedPayload = `${payload.slice(0, -2)}aa` // flip payload bytes -> signature no longer matches
    const error = await capture(newService().verifyIdToken(`${header}.${tamperedPayload}.${signature}`))
    expect(error.getStatus?.()).toBe(401)
  })

  it('returns 503 LINE_UNAVAILABLE when the discovery endpoint fails', async () => {
    discoveryFailures = 1
    const error = await capture(newService().verifyIdToken(await signToken()))
    expect(error.code).toBe('LINE_UNAVAILABLE')
    expect(error.getStatus?.()).toBe(503)
  })

  it('production default discovery URL points at LINE (guards accidental override)', () => {
    // The DI value used by LineModule; imported indirectly via the service file.
    expect(LINE_DISCOVERY_URL).toBe('https://access.line.me/.well-known/openid-configuration')
  })
})