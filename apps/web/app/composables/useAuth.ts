import type { ApiEnvelope, UserProfile } from '~/utils/api'

/**
 * Shared auth state (design doc §6.6).
 *
 * The auth cookies are path-scoped to /api/v1 (design doc §5.2), so they ride
 * along with same-origin `/api/v1/*` requests through the Nitro proxy — but
 * they are never sent with page requests, which means SSR cannot see them.
 * The user is therefore resolved on app init on the client (plugins/auth.client.ts)
 * and the state is then kept across client-side navigations.
 */
export const useAuth = () => {
  const user = useState<UserProfile | null>('auth:user', () => null)
  const nuxtApp = useNuxtApp()

  /**
   * Resolve the current user from the auth cookies.
   * Returns null when the request is unauthenticated (never throws).
   */
  const fetchUser = async (): Promise<UserProfile | null> => {
    if (import.meta.server) return null
    try {
      const res = await nuxtApp.$api<ApiEnvelope<UserProfile>>('/auth/me')
      user.value = res.data
    } catch {
      user.value = null
    }
    return user.value
  }

  /** Log in with username/email + password. Throws (with the API's Thai message) on failure. */
  const login = async (payload: { username_or_email: string; password: string }): Promise<UserProfile> => {
    const res = await nuxtApp.$api<ApiEnvelope<UserProfile>>('/auth/login', { method: 'POST', body: payload })
    user.value = res.data
    return res.data
  }

  /** Revoke the session server-side and clear the local state (idempotent). */
  const logout = async (): Promise<void> => {
    try {
      await nuxtApp.$api('/auth/logout', { method: 'POST' })
    } finally {
      user.value = null
    }
  }

  return { user, fetchUser, login, logout }
}
