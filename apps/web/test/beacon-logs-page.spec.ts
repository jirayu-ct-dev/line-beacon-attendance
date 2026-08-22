import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import BeaconLogsPage from '~/pages/admin/beacon-logs.vue'
import { useAuth } from '~/composables/useAuth'
import type { ApiEnvelope, BeaconLog, Paginated, UserProfile } from '~/utils/api'

const admin: UserProfile = { id: 'u1', email: 'admin@example.com', username: 'admin', role: 'ADMIN' }

const log = (overrides: Partial<BeaconLog> = {}): BeaconLog => ({
  id: 'l1',
  lineUserId: 'U4af498062a...',
  student: { id: 's1', studentCode: '660112230038', name: 'Somchai Jaidee' },
  beacon: { id: 'b1', name: 'CS Room 101' },
  hwid: '32af519e88',
  eventType: 'enter',
  eventTimestamp: '2026-08-22T03:00:00.000Z',
  webhookEventId: '22babee0-bdbe-43a5-a29a-ac8e6d1ba3c7',
  processingStatus: 'PROCESSED',
  createdAt: '2026-08-22T03:00:01.000Z',
  ...overrides,
})

const paginated = (items: BeaconLog[]): ApiEnvelope<Paginated<BeaconLog>> => ({
  success: true,
  data: { items, total: items.length, page: 1, pageSize: 20 },
})

const mountPage = async () => {
  const wrapper = await mountSuspended(BeaconLogsPage)
  await flushPromises()
  return wrapper
}

describe('admin beacon-logs page', () => {
  beforeEach(() => {
    registerEndpoint('/api/v1/auth/me', () => ({ success: true, data: admin }))
    useAuth().user.value = admin
  })

  it('renders the search/hwid/date-range filters with visible labels', async () => {
    registerEndpoint('/api/v1/beacon-logs', () => paginated([log()]))
    const wrapper = await mountPage()

    for (const labelText of ['ค้นหา', 'HWID', 'จากวันที่', 'ถึงวันที่']) {
      const label = wrapper.findAll('label').find((element) => element.text() === labelText)
      expect(label, labelText).toBeDefined()
      expect(wrapper.find(`#${label!.attributes('for')}`).exists()).toBe(true)
    }
    expect(wrapper.text()).toContain('สถานะ')
  })

  it('renders the empty state when there are no logs and no filter', async () => {
    registerEndpoint('/api/v1/beacon-logs', () => paginated([]))
    const wrapper = await mountPage()

    expect(wrapper.text()).toContain('ยังไม่มีข้อมูล')
    expect(wrapper.text()).not.toContain('ไม่พบผลลัพธ์')
  })

  it('renders log rows with student/beacon info and Thai status/event labels', async () => {
    registerEndpoint('/api/v1/beacon-logs', () => paginated([
      log(),
      log({
        id: 'l2',
        student: null,
        beacon: null,
        eventType: 'stay',
        hwid: '0189d3b1c2',
        processingStatus: 'UNKNOWN_BEACON',
      }),
    ]))
    const wrapper = await mountPage()

    expect(wrapper.text()).toContain('660112230038 (Somchai Jaidee)')
    expect(wrapper.text()).toContain('CS Room 101')
    expect(wrapper.text()).toContain('เข้าพื้นที่')
    expect(wrapper.text()).toContain('อยู่ในพื้นที่')
    expect(wrapper.text()).toContain('ประมวลผลแล้ว')
    expect(wrapper.text()).toContain('ไม่พบบีคอน')

    const iconButtons = wrapper.findAll('button[aria-label]')
    expect(iconButtons.some((button) => button.attributes('aria-label')?.startsWith('ดูรายละเอียดเหตุการณ์'))).toBe(true)
  })

  it('renders an access-denied state instead of a broken table on 403', async () => {
    registerEndpoint('/api/v1/beacon-logs', () => {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
    })
    const wrapper = await mountPage()

    expect(wrapper.text()).toContain('ไม่มีสิทธิ์เข้าถึง')
    expect(wrapper.text()).not.toContain('ยังไม่มีข้อมูล')
  })
})
