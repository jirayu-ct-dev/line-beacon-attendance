import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LiffActivities from '~/pages/liff/activities.vue'

vi.mock('@line/liff', () => ({
  default: {
    init: vi.fn(async () => undefined),
    isInClient: () => true,
    isLoggedIn: () => true,
    getIDToken: () => 'test-id-token',
    login: vi.fn(),
  },
}))

const liffState = () => useState<{ status: string }>('liff:state')

/** flushPromises alone misses the dynamic LIFF import + fetch — settle a macrotask too. */
const settle = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 20))
  await flushPromises()
}

/** One MyActivityItem (apps/api MyActivityItemDto). */
const activity = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'act1',
  name: 'ปฐมนิเทศน์นักศึกษาใหม่',
  description: null,
  location: 'ห้องประชุมใหญ่',
  startAt: '2026-09-20T10:00:00.000Z',
  endAt: '2026-09-20T12:00:00.000Z',
  checkinOpenAt: '2026-09-20T08:30:00.000Z',
  lateAt: '2026-09-20T09:15:00.000Z',
  checkinCloseAt: '2026-09-20T11:00:00.000Z',
  timeState: 'UPCOMING',
  myAttendance: null,
  ...overrides,
})

describe('liff activities page', () => {
  beforeEach(() => {
    liffState().value = { status: 'ready', isInClient: true, isLoggedIn: true }
    useState('liff:session').value = { token: null, me: null, loading: true, error: null }
    registerEndpoint('/api/v1/me', () => ({
      success: true,
      data: { linked: true, student: { id: 's1' }, line: { lineUserId: 'U123' } },
    }))
  })

  it('renders the empty state when nothing is published', async () => {
    registerEndpoint('/api/v1/me/activities', () => ({
      success: true,
      data: { items: [], total: 0, page: 1, pageSize: 10 },
    }))
    const wrapper = await mountSuspended(LiffActivities)
    await settle()

    expect(wrapper.text()).toContain('ยังไม่มีกิจกรรมที่เปิดเผยแพร่')
  })

  it('renders activity cards with a checked-in marker and links to the detail', async () => {
    registerEndpoint('/api/v1/me/activities', () => ({
      success: true,
      data: {
        items: [
          activity({ myAttendance: { checkInAt: '2026-09-20T09:05:00.000Z', status: 'PRESENT', checkinMethod: 'BEACON' } }),
          activity({ id: 'act2', name: 'อบรม Nuxt', location: null }),
        ],
        total: 2,
        page: 1,
        pageSize: 10,
      },
    }))
    const wrapper = await mountSuspended(LiffActivities)
    await settle()

    expect(wrapper.text()).toContain('ปฐมนิเทศน์นักศึกษาใหม่')
    expect(wrapper.text()).toContain('อบรม Nuxt')
    expect(wrapper.text()).toContain('ห้องประชุมใหญ่')
    expect(wrapper.text()).toContain('เช็คชื่อแล้ว')
    expect(wrapper.find('a[href="/liff/activities/act1"]').exists()).toBe(true)
    // timeState badge label (UPCOMING) pairs the status with text per §6.2
    expect(wrapper.text()).toContain('ยังไม่เริ่ม')
  })
})
