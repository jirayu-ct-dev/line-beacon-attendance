import { ActivityTimeState } from './dto/activity-response.dto'

/**
 * Where an activity sits in time relative to `now`. Shared by the dashboard
 * (ActivityResponseDto) and the student LIFF activities view (GET /me/activities)
 * so both surfaces always agree on the UPCOMING/CHECKIN_OPEN/ONGOING/COMPLETED
 * boundaries.
 */
export function timeStateOf(activity: {
  checkinOpenAt: Date
  checkinCloseAt: Date
  endAt: Date
}): ActivityTimeState {
  const now = Date.now()
  if (now < activity.checkinOpenAt.getTime()) return 'UPCOMING'
  if (now <= activity.checkinCloseAt.getTime()) return 'CHECKIN_OPEN'
  if (now <= activity.endAt.getTime()) return 'ONGOING'
  return 'COMPLETED'
}
