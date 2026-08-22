import type { FetchError } from 'ofetch'

/** User profile returned by /auth/login, /auth/refresh and /auth/me. */
export interface UserProfile {
  id: string
  email: string
  username: string
  role: 'ADMIN' | 'ORGANIZER'
}

/** Success envelope from the API (spec §48): { success: true, data } */
export interface ApiEnvelope<T> {
  success: true
  data: T
}

/** Error envelope from the API (spec §48): { success: false, error: { code, message } } */
export interface ApiErrorEnvelope {
  success: false
  error: { code: string; message: string }
}

/**
 * Extract the Thai error message the API already provides
 * (`error.data.error.message`), falling back to a generic Thai message.
 */
export const getApiErrorMessage = (error: unknown, fallback: string): string => {
  const fetchError = error as FetchError<ApiErrorEnvelope> | null
  return fetchError?.data?.error?.message || fallback
}
