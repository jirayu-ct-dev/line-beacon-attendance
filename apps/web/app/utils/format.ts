// Date display: stored/sent as UTC, always shown in Asia/Bangkok (AGENTS §6).
const dateTimeFormatter = new Intl.DateTimeFormat('th-TH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Bangkok',
})

const dateFormatter = new Intl.DateTimeFormat('th-TH', {
  dateStyle: 'medium',
  timeZone: 'Asia/Bangkok',
})

const format = (iso: string, formatter: Intl.DateTimeFormat): string => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : formatter.format(date)
}

/** e.g. "22 ส.ค. 2569, 14:05" (Asia/Bangkok). Invalid input is returned as-is. */
export const formatDateTime = (iso: string): string => format(iso, dateTimeFormatter)

/** e.g. "22 ส.ค. 2569" (Asia/Bangkok). Invalid input is returned as-is. */
export const formatDate = (iso: string): string => format(iso, dateFormatter)
