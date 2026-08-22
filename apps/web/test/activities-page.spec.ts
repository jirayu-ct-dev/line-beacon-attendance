import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import ActivitiesIndex from '~/pages/activities/index.vue'
import { useAuth } from '~/composables/useAuth'
import type { Activity, ApiEnvelope, Paginated, UserProfile } from '~/utils/api'

const admin: UserProfile = { id: 'u1', email: 'admin@example.com', username: 'admin', role: 'ADMIN' }

const activity = (overrides: Partial<Activity> = {}): Activity => ({
  id: 'a1',
  name: 'Orientation 2026',
  description: null,
  location: 'ห้องประชุมใหญ่',
  startAt: '2027-03-10T03:00:00.000Z',
  endAt: '2027-03-10T05:00:00.000Z',
  checkinOpenAt: '2027-03-10T02:00:00.000Z',
  lateAt: '2027-03-10T03:30:00.000Z',
  checkinCloseAt: '2027-03-10T04:00:00.000Z',
  status: 'DRAFT',
  timeState: 'UPCOMING',
  createdBy: 'u1',
  creator: { id: 'u1', username: 'admin' },
  beaconCount: 2,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  ...overrides,
})

const paginated = (items: Activity[]): ApiEnvelope<Paginated<Activity>> => ({
  success: true,
  data: { items, total: items.length, page: 1, pageSize: 20 },
})

const mountPage = async () => {
  const wrapper = await mountSuspended(ActivitiesIndex)
  await flushPromises()
  return wrapper
}

describe('activities index page', () => {
  beforeEach(() => {
    registerEndpoint('/api/v1/auth/me', () => ({ success: true, data: admin }))
    useAuth().user.value = admin
  })

  it('renders the search input with a visible label and status filter', async () => {
    registerEndpoint('/api/v1/activities', () => paginated([activity()]))
    const wrapper = await mountPage()

    const label = wrapper.findAll('label').find((element) => element.text() === 'ค้นหา')
    expect(label).toBeDefined()
    expect(wrapper.find(`#${label!.attributes('for')}`).exists()).toBe(true)
    expect(wrapper.text()).toContain('สถานะ')
  })

  it('renders the empty state when there are no activities and no filter', async () => {
    registerEndpoint('/api/v1/activities', () => paginated([]))
    const wrapper = await mountPage()

    expect(wrapper.text()).toContain('ยังไม่มีข้อมูล')
    expect(wrapper.text()).not.toContain('ไม่พบผลลัพธ์')
  })

  it('renders activity rows with Thai status labels, check-in window and a create action', async () => {
    registerEndpoint('/api/v1/activities', () =>
      paginated([
        activity(),
        activity({ id: 'a2', name: 'Meeting', status: 'PUBLISHED', timeState: 'CHECKIN_OPEN', beaconCount: 0 }),
      ]),
    )
    const wrapper = await mountPage()

    expect(wrapper.text()).toContain('Orientation 2026')
    // Status + computed time state both render as text labels with color
    expect(wrapper.text()).toContain('ฉบับร่าง')
    expect(wrapper.text()).toContain('เผยแพร่')
    expect(wrapper.text()).toContain('ยังไม่เริ่ม')
    expect(wrapper.text()).toContain('เปิดเช็คชื่อ')

    const createButton = wrapper.findAll('a').find((element) => element.text() === 'สร้างกิจกรรม')
    expect(createButton).toBeDefined()

    const iconLinks = wrapper.findAll('a[aria-label]')
    expect(iconLinks.some((link) => link.attributes('aria-label') === 'ดูรายละเอียดกิจกรรม Orientation 2026')).toBe(true)
    expect(iconLinks.some((link) => link.attributes('aria-label') === 'ดูรายละเอียดกิจกรรม Meeting')).toBe(true)
  })
})
