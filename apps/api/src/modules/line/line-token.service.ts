import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { ApiError } from '../../common/http/api-error'

/**
 * LINE ID Token (JWT) verification for LIFF auth (spec §7.1, design doc §5.2).
 *
 * The @line/bot-sdk (v11) ships no ID-token validation — its `liff` namespace
 * is the LIFF-app *management* API — so tokens are verified here with `jose`
 * against LINE's OpenID configuration:
 *
 *   https://access.line.me/.well-known/openid-configuration -> jwks_uri
 *   issuer: https://access.line.me (older tokens: https://line.me)
 *   audience: LINE_LOGIN_CHANNEL_ID
 *   algorithm: ES256 (the only alg LINE advertises), exp enforced by jwtVerify
 *
 * The client MUST never be trusted for line_user_id (spec §7.1) — it is always
 * taken from the verified token's `sub`. The raw token is never logged.
 */

/** LINE's OpenID discovery document (LINE Login channel) — overridable in tests via DI. */
export const LINE_OIDC_DISCOVERY_URL = 'https://access.line.me/.well-known/openid-configuration'
/** DI token for the discovery URL (same value in production). */
export const LINE_OIDC_DISCOVERY = Symbol('LINE_OIDC_DISCOVERY')
/** LINE documented issuers: current + legacy (tokens issued before 2021). */
const LINE_ISSUERS = ['https://access.line.me', 'https://line.me']

export interface LineIdTokenPayload {
  /** Verified LINE User ID (token `sub`) — same ID space as the webhook. */
  lineUserId: string
  /** Profile claims (present when the LIFF app scope includes `profile`). */
  name?: string
  picture?: string
}

@Injectable()
export class LineTokenService {
  private readonly logger = new Logger(LineTokenService.name)
  /** Lazily created JWSet + the discovery lookup, cached for the process lifetime. */
  private jwksUrlPromise: Promise<URL> | null = null
  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null

  constructor(
    private readonly config: ConfigService,
    @Inject(LINE_OIDC_DISCOVERY) private readonly discoveryUrl: string,
  ) {}

  /**
   * Verifies a LINE ID Token and returns its verified claims.
   * Throws 503 LINE_NOT_CONFIGURED when LINE_LOGIN_CHANNEL_ID is unset
   * (same optional-at-boot pattern as the 4a webhook secret) and
   * 401 UNAUTHORIZED for any missing/invalid/expired token.
   */
  async verifyIdToken(idToken: string): Promise<LineIdTokenPayload> {
    const channelId = this.config.get<string | undefined>('LINE_LOGIN_CHANNEL_ID')
    if (!channelId) {
      throw new ApiError('LINE_NOT_CONFIGURED', 'ยังไม่ได้ตั้งค่า LINE_LOGIN_CHANNEL_ID', 503)
    }

    let payload: Record<string, unknown>
    try {
      ;({ payload } = await jwtVerify(idToken, await this.getJwks(), {
        issuer: LINE_ISSUERS,
        audience: channelId,
        algorithms: ['ES256'],
      }))
    } catch (error) {
      // Signature/exp/iss/aud failures are client problems -> 401. Network/JWKS
      // failures are LINE-side -> 503 so the LIFF app can tell the user to retry.
      throw this.toAuthError(error)
    }

    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new UnauthorizedException('การยืนยันตัวตนผ่าน LINE ไม่สำเร็จ กรุณาปิดและเปิดหน้านี้ใหม่อีกครั้ง')
    }

    return {
      lineUserId: payload.sub,
      name: optionalString(payload.name),
      picture: optionalString(payload.picture),
    }
  }

  private async getJwks(): Promise<ReturnType<typeof createRemoteJWKSet>> {
    if (this.jwks) return this.jwks
    this.jwksUrlPromise ??= this.discoverJwksUrl()
    try {
      this.jwks = createRemoteJWKSet(await this.jwksUrlPromise)
      return this.jwks
    } catch (error) {
      this.jwksUrlPromise = null // let the next call retry the discovery
      throw error
    }
  }

  private async discoverJwksUrl(): Promise<URL> {
    try {
      const response = await fetch(this.discoveryUrl, {
        signal: AbortSignal.timeout(10_000),
        headers: { accept: 'application/json' },
      })
      if (!response.ok) throw new Error(`LINE discovery responded ${response.status}`)
      const document = (await response.json()) as { jwks_uri?: unknown }
      if (typeof document.jwks_uri !== 'string') throw new Error('jwks_uri missing from discovery document')
      return new URL(document.jwks_uri)
    } catch (error) {
      this.logger.warn(`LINE OIDC discovery failed: ${describe(error)}`)
      throw new ApiError('LINE_UNAVAILABLE', 'ไม่สามารถติดต่อ LINE เพื่อยืนยันตัวตนได้ กรุณาลองใหม่อีกครั้ง', 503)
    }
  }

  private toAuthError(error: unknown): Error {
    if (error instanceof ApiError) return error
    // jose resolves JWKS/network rejections inside jwtVerify too — same 503.
    if (isNetworkError(error)) {
      this.logger.warn(`LINE JWKS fetch failed: ${describe(error)}`)
      return new ApiError('LINE_UNAVAILABLE', 'ไม่สามารถติดต่อ LINE เพื่อยืนยันตัวตนได้ กรุณาลองใหม่อีกครั้ง', 503)
    }
    // Expired/invalid signature/wrong iss or aud — never log the token itself.
    return new UnauthorizedException('การยืนยันตัวตนผ่าน LINE ไม่สำเร็จ กรุณาปิดและเปิดหน้านี้ใหม่อีกครั้ง')
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

/** jose flags upstream/JWKS problems distinctly from token problems (`ERR_JWKS*`, fetch TypeError, timeouts). */
function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return true
  const code = (error as { code?: unknown }).code
  if (typeof code === 'string' && code.startsWith('ERR_JWKS')) return true
  return error instanceof TypeError // fetch() rejects with TypeError on network failure
}
