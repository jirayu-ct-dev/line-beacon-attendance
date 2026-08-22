import { Response } from 'express'
import { TokenPair } from './auth.service'

/**
 * Cookie design (design doc §5.2): both tokens live in httpOnly cookies scoped to
 * the API prefix so the Nuxt app can proxy them same-origin. `secure` comes from
 * COOKIE_SECURE (false in local dev behind plain http, true behind TLS).
 */
const COOKIE_PATH = '/api/v1'
const ACCESS_COOKIE = 'access_token'
const REFRESH_COOKIE = 'refresh_token'

export function setAuthCookies(res: Response, tokens: TokenPair, secure: boolean): void {
  const base = { httpOnly: true, sameSite: 'lax' as const, path: COOKIE_PATH, secure }
  res.cookie(ACCESS_COOKIE, tokens.accessToken, { ...base, maxAge: tokens.accessMaxAgeMs })
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, { ...base, maxAge: tokens.refreshMaxAgeMs })
}

export function clearAuthCookies(res: Response, secure: boolean): void {
  const base = { httpOnly: true, sameSite: 'lax' as const, path: COOKIE_PATH, secure }
  res.clearCookie(ACCESS_COOKIE, base)
  res.clearCookie(REFRESH_COOKIE, base)
}

export function readRefreshCookie(req: { cookies?: Record<string, string> }): string | undefined {
  return req.cookies?.[REFRESH_COOKIE]
}
