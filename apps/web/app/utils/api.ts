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

/** Paginated list payload shared by every list endpoint (apps/api PaginationDto). */
export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

/** Student payload (apps/api StudentResponseDto — the source of truth). */
export interface Student {
  id: string
  studentCode: string
  firstName: string
  lastName: string
  /** YYYY-MM-DD (ค.ศ.) */
  birthDate: string
  year: number
  email: string | null
  status: 'ACTIVE' | 'INACTIVE'
  lineLinked: boolean
  createdAt: string
  updatedAt: string
}

/** Row validation report from POST /students/import/preview (and apply errors). */
export interface ImportRowResult {
  row: number
  studentCode: string
  status: 'valid' | 'error'
  errors: string[]
}

export interface ImportPreviewResult {
  totalRows: number
  validRows: number
  errorRows: number
  rows: ImportRowResult[]
}

export interface ImportApplyResult {
  created: number
  updated: number
  errorRows: number
  errors: ImportRowResult[]
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
