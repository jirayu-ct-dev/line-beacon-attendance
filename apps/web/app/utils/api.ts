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

/** Beacon payload (apps/api BeaconResponseDto — the source of truth). */
export interface Beacon {
  id: string
  hwid: string
  name: string
  location: string | null
  description: string | null
  status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE'
  createdAt: string
  updatedAt: string
}

/** Processing status of a beacon-log row (apps/api ProcessingStatus, spec §18). */
export type BeaconLogStatus =
  | 'RECEIVED'
  | 'PROCESSED'
  | 'DUPLICATE'
  | 'UNKNOWN_USER'
  | 'UNKNOWN_BEACON'
  | 'NO_ACTIVE_ACTIVITY'
  | 'OUTSIDE_CHECKIN_WINDOW'
  | 'ERROR'

/** Nested student shown on beacon-log rows (null when the LINE user is not linked). */
export interface BeaconLogStudent {
  id: string
  studentCode: string
  name: string
}

/** Nested beacon shown on beacon-log rows (null for unregistered hwids). */
export interface BeaconLogBeacon {
  id: string
  name: string
}

/** Beacon-log row (apps/api BeaconLogResponseDto — spec §18). */
export interface BeaconLog {
  id: string
  lineUserId: string
  student: BeaconLogStudent | null
  beacon: BeaconLogBeacon | null
  hwid: string
  eventType: string
  eventTimestamp: string
  webhookEventId: string
  processingStatus: BeaconLogStatus
  createdAt: string
}

/** Beacon-log detail — adds the raw LINE payload (apps/api BeaconLogDetailDto). */
export interface BeaconLogDetail extends BeaconLog {
  rawPayload: unknown
}

/** Computed activity time state (apps/api ActivityTimeState, spec §12). */
export type ActivityTimeState = 'UPCOMING' | 'CHECKIN_OPEN' | 'ONGOING' | 'COMPLETED'

export interface ActivityCreator {
  id: string
  username: string
}

/** Activity list row (apps/api ActivityResponseDto — the source of truth). */
export interface Activity {
  id: string
  name: string
  description: string | null
  location: string | null
  startAt: string
  endAt: string
  checkinOpenAt: string
  lateAt: string
  checkinCloseAt: string
  status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED'
  timeState: ActivityTimeState
  createdBy: string
  creator: ActivityCreator
  beaconCount: number
  createdAt: string
  updatedAt: string
}

/** Attendance summary on the activity detail (spec §24/§44 — absent computed). */
export interface AttendanceSummary {
  totalStudents: number
  present: number
  late: number
  excused: number
  absent: number
}

/** Activity detail — adds the linked beacons and §24 summary (apps/api ActivityDetailDto). */
export interface ActivityDetail extends Activity {
  beacons: Beacon[]
  attendanceSummary: AttendanceSummary
}

/** Attendance row on GET /activities/:id/attendances (apps/api AttendanceRowDto, spec §25). */
export interface AttendanceRow {
  id: string
  student: { id: string; studentCode: string; name: string }
  checkInAt: string
  status: 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED'
  checkinMethod: 'BEACON' | 'MANUAL'
  beacon: { id: string; name: string; hwid: string } | null
  checkedInBy: { id: string; username: string } | null
  manualReason: string | null
  createdAt: string
  updatedAt: string
}

/** Row on GET /students/:id/attendances (apps/api StudentAttendanceRowDto). */
export interface StudentAttendanceRow {
  id: string
  activityId: string
  activityName: string
  checkInAt: string
  status: 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED'
  checkinMethod: 'BEACON' | 'MANUAL'
  beacon: { id: string; name: string; hwid: string } | null
  checkedInBy: { id: string; username: string } | null
  manualReason: string | null
}

/** GET /dashboard payload (spec §23, §45). */
export interface DashboardStats {
  today: { activities: number; checkins: number; present: number; late: number }
  totalActivities: number
  recentActivities: { id: string; name: string; startAt: string; status: string; timeState: ActivityTimeState }[]
  openCheckinActivities: {
    id: string
    name: string
    checkinOpenAt: string
    lateAt: string
    checkinCloseAt: string
    present: number
    late: number
  }[]
}

/** User row on the organizers page (apps/api UserResponseDto, spec §28). */
export interface UserRow {
  id: string
  email: string
  username: string
  role: 'ADMIN' | 'ORGANIZER'
  status: 'ACTIVE' | 'INACTIVE'
  createdAt: string
  updatedAt: string
}

/** Audit-log row (apps/api AuditLogResponseDto, spec §56). */
export interface AuditLog {
  id: string
  user: { id: string; username: string } | null
  action: string
  entityType: string
  entityId: string
  createdAt: string
}

export interface AuditLogDetail extends AuditLog {
  oldValue: unknown
  newValue: unknown
}

/** Row validation report from POST /students/import/preview (and apply errors). */
export interface ImportRowResult {
  row: number
  studentCode: string
  status: 'valid' | 'error'
  errors: string[]
}

/** Student profile subset on the LIFF /me payload (apps/api StudentProfileDto). */
export interface StudentProfile {
  id: string
  studentCode: string
  firstName: string
  lastName: string
  /** YYYY-MM-DD (ค.ศ.) */
  birthDate: string
  year: number
  email: string | null
  status: 'ACTIVE' | 'INACTIVE'
}

/** LINE link info on the LIFF /me payload (apps/api LineLinkInfoDto). */
export interface LineLinkInfo {
  lineUserId: string
  displayName: string | null
  pictureUrl: string | null
  linkedAt: string
}

/** GET /me payload (apps/api MeResponseDto). */
export interface MeResponse {
  linked: boolean
  student: StudentProfile | null
  line: LineLinkInfo | null
}

/** One attendance record on GET /me/attendances (apps/api AttendanceItemDto). */
export interface AttendanceItem {
  id: string
  activityId: string
  activityName: string
  checkInAt: string
  status: 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED'
  checkinMethod: 'BEACON' | 'MANUAL'
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
