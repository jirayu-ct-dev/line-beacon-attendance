import type { FetchError } from 'ofetch'
import type { ApiErrorEnvelope } from '~/utils/api'

/**
 * API client for the LIFF pages. Deliberately separate from the dashboard
 * `$api` plugin: LIFF requests authenticate with a Bearer LINE ID Token (no
 * cookies), and a 401 must NOT trigger the dashboard refresh-and-redirect
 * flow — the student simply re-opens the page in LINE. Errors are re-thrown
 * with the API's Thai message (same UX contract as $api).
 */
export const useLiffApi = () => {
  const request = async <T>(
    path: string,
    options: {
      method?: 'GET' | 'POST'
      body?: Record<string, string>
      /** LINE ID Token from useLiff().getIdToken(). */
      token: string
    },
  ): Promise<T> => {
    try {
      const res = await $fetch<{ success: true; data: T }>(path, {
        baseURL: '/api/v1',
        method: options.method ?? 'GET',
        body: options.body,
        headers: { Authorization: `Bearer ${options.token}` },
      })
      return res.data
    } catch (error) {
      const fetchError = error as FetchError<ApiErrorEnvelope>
      if (fetchError?.data?.error?.message) {
        fetchError.message = fetchError.data.error.message
      }
      throw fetchError
    }
  }

  return { request }
}
