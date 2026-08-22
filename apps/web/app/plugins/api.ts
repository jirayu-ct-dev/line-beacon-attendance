import type { FetchError } from 'ofetch'
import type { ApiErrorEnvelope } from '~/utils/api'

/**
 * Same-origin API client (design doc §6.6).
 *
 * The browser only ever talks to this Nuxt server (`/api/v1/...` relative),
 * so the httpOnly auth cookies (Path=/api/v1) stay first-party; the Nitro
 * routeRules proxy forwards every request to the NestJS API.
 *
 * On a 401 (except for the login/refresh calls themselves) it tries
 * `POST /auth/refresh` once and retries the original request; if the refresh
 * fails it clears the user state and navigates to /login. Errors are re-thrown
 * with the API's Thai message so callers can toast it directly.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const baseApi = $fetch.create({ baseURL: '/api/v1' })

  // Endpoints that must never trigger the refresh-retry loop themselves.
  const isAuthEndpoint = (request: string) => request.includes('/auth/login') || request.includes('/auth/refresh')

  // Single-flight refresh: concurrent 401s share one call (tokens rotate, so a
  // second parallel refresh with the old token would fail).
  let refreshPromise: Promise<unknown> | null = null

  // Options stay in sync with whatever $fetch instance type Nuxt provides.
  const api = async <T>(request: string, options?: Parameters<typeof baseApi>[1]): Promise<T> => {
    try {
      return await baseApi<T>(request, options)
    } catch (error) {
      const fetchError = error as FetchError<ApiErrorEnvelope>

      if (import.meta.client && fetchError?.status === 401 && !isAuthEndpoint(request)) {
        try {
          refreshPromise ??= baseApi('/auth/refresh', { method: 'POST' }).finally(() => {
            refreshPromise = null
          })
          await refreshPromise
          return await baseApi<T>(request, options)
        } catch {
          // Refresh failed — session is gone. Clear state and go to /login.
          await nuxtApp.runWithContext(async () => {
            const { user } = useAuth()
            user.value = null
            const route = useRoute()
            if (route.path !== '/login') {
              await navigateTo('/login', { replace: true })
            }
          })
        }
      }

      // Surface the API's Thai message on the thrown error so callers can toast it.
      if (fetchError?.data?.error?.message) {
        fetchError.message = fetchError.data.error.message
      }
      throw fetchError
    }
  }

  return { provide: { api } }
})
