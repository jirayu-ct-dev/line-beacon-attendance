import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReportsIndex from '~/pages/reports/index.vue'
import { useAuth } from '~/composables/useAuth'
import type { Activity, ActivityReport, ApiEnvelope, Paginated, UserProfile } from '~/utils/api'

const admin: UserProfile = { id: 'u1', email: 'admin@example.com', username: 'admin', role: 'ADMIN' }
const organizer: UserProfile = { id: 'u2', email: 'org@example.com', username: 'org', role: 'ORGANIZER' }

const activity = (overrides: Partial<Activity> = {}): Activity => ({
  id: 'a1',
  name: 'Git Workshop',
  description: null,
  location: 'Lab 1',
  startAt: '2026-09-01T13:00:00.000Z',
  endAt: '2026-09-01T16:00:00.000Z',
  checkinOpenAt: '2026-09-01T12:30:00.000Z',
  lateAt: '2026-09-01T14:00:00.000Z',
  checkinCloseAt: '2026-09-01T15:00:00.000Z',
  status: 'PUBLISHED',
  timeState: 'COMPLETED',
  createdBy: 'u2',
  creator: { id: 'u2', username: 'org' },
  beaconCount: 1,
  createdAt: '2026-08-22T00:00:00.000Z',
  updatedAt: '2026-08-22T00:00:00.000Z',
  ...overrides,
})

const report: ActivityReport = {
  activity: {
    id: 'a1',
    name: 'Git Workshop',
    startAt: '2026-09-01T13:00:00.000Z',
    endAt: '2026-09-01T16:00:00.000Z',
    checkinOpenAt: '2026-09-01T12:30:00.000Z',
    checkinCloseAt: '2026-09-01T15:00:00.000Z',
    status: 'PUBLISHED',
    organizer: { id: 'u2', username: 'org' },
  },
  summary: { totalStudents: 3, present: 1, late: 1, excused: 0, absent: 1 },
  attendances: [
    {
      id: 'att1',
      student: { id: 's1', studentCode: '660112230038', name: 'Somchai Jaidee' },
      checkInAt: '2026-09-01T12:45:00.000Z',
      status: 'PRESENT',
      checkinMethod: 'BEACON',
      beacon: { id: 'b1', name: 'CS Room 101', hwid: '32af519e88' },
      checkedInBy: null,
      manualReason: null,
      createdAt: '2026-09-01T12:45:00.000Z',
      updatedAt: '2026-09-01T12:45:00.000Z',
    },
  ],
}

const paginated = (items: Activity[]): ApiEnvelope<Paginated<Activity>> => ({
  success: true,
  data: { items, total: items.length, page: 1, pageSize: 20 },
})

const mountPage = async () => {
  const wrapper = await mountSuspended(ReportsIndex)
  await flushPromises()
  return wrapper
}

const openReport = async () => {
  const wrapper = await mountPage()
  const button = wrapper.findAll('button[aria-label]').find((b) => b.attributes('aria-label') === 'ดูรายงานกิจกรรม Git Workshop')
  expect(button).toBeDefined()
  await button!.trigger('click')
  await flushPromises()
  return wrapper
}

describe('reports page', () => {
  beforeEach(() => {
    registerEndpoint('/api/v1/auth/me', () => ({ success: true, data: admin }))
    registerEndpoint('/api/v1/activities', () => paginated([activity()]))
    registerEndpoint('/api/v1/reports/activities/a1', () => ({ success: true, data: report }))
    useAuth().user.value = admin
  })

  it('opens the §44 report when an activity row is selected', async () => {
    const wrapper = await openReport()

    expect(wrapper.text()).toContain('Git Workshop')
    expect(wrapper.text()).toContain('ผู้จัด org')
    expect(wrapper.text()).toContain('นักศึกษาทั้งหมด (ACTIVE)')
    expect(wrapper.text()).toContain('ขาด (คำนวณ)')
    expect(wrapper.text()).toContain('Somchai Jaidee')
    expect(wrapper.text()).toContain('660112230038')
    expect(wrapper.text()).toContain('32af519e88')
    expect(wrapper.text()).toContain('Beacon')
    expect(wrapper.findAll('button').some((button) => button.text() === 'ส่งออก CSV')).toBe(true)
    expect(wrapper.findAll('button').some((button) => button.text() === 'ส่งออก Excel')).toBe(true)
  })

  it('renders the empty state when there are no activities', async () => {
    registerEndpoint('/api/v1/activities', () => paginated([]))
    const wrapper = await mountPage()

    expect(wrapper.text()).toContain('ยังไม่มีข้อมูล')
    expect(wrapper.text()).not.toContain('ไม่พบผลลัพธ์')
  })

  it('hides the per-student report section from organizers', async () => {
    useAuth().user.value = organizer
    const wrapper = await mountPage()

    expect(wrapper.text()).not.toContain('รายงานรายบุคคล')
  })

  it('shows the per-student report section for admins', async () => {
    const wrapper = await mountPage()

    expect(wrapper.text()).toContain('รายงานรายบุคคล')
    expect(wrapper.text()).toContain('เฉพาะ Admin')
  })

  it('downloads the CSV export', async () => {
    const createObjectURL = vi.fn(() => 'blob:mock')
    const revokeObjectURL = vi.fn()
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL

    const exportHandler = vi.fn(() => ({ body: 'รายงาน', headers: { 'Content-Type': 'text/csv; charset=utf-8' } }))
    registerEndpoint('/api/v1/reports/activities/a1/export', exportHandler)
    const wrapper = await openReport()

    const button = wrapper.findAll('button').find((b) => b.text() === 'ส่งออก CSV')
    expect(button).toBeDefined()
    await button!.trigger('click')
    await flushPromises()

    expect(exportHandler).toHaveBeenCalledTimes(1)
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledTimes(1)
  })
})
