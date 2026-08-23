import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LiffHistory from '~/pages/liff/history.vue'

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

describe('liff history page', () => {
  beforeEach(() => {
    liffState().value = { status: 'ready', isInClient: true, isLoggedIn: true }
    useState('liff:session').value = { token: null, me: null, loading: true, error: null }
    registerEndpoint('/api/v1/me', () => ({
      success: true,
      data: { linked: true, student: { id: 's1' }, line: { lineUserId: 'U123' } },
    }))
  })

  it('renders the empty state when the student has no attendance', async () => {
    registerEndpoint('/api/v1/me/attendances', () => ({
      success: true,
      data: { items: [], total: 0, page: 1, pageSize: 10 },
    }))
    const wrapper = await mountSuspended(LiffHistory)
    await settle()

    expect(wrapper.text()).toContain('ประวัติการเช็คชื่อ')
    expect(wrapper.text()).toContain('ยังไม่มีประวัติการเช็คชื่อ')
  })

  it('renders attendance cards with status labels, linking to the activity detail', async () => {
    registerEndpoint('/api/v1/me/attendances', () => ({
      success: true,
      data: {
        items: [
          {
            id: 'a1',
            activityId: 'act1',
            activityName: 'ปฐมนิเทศน์นักศึกษาใหม่',
            checkInAt: '2026-08-20T09:05:00.000Z',
            status: 'PRESENT',
            checkinMethod: 'BEACON',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 10,
      },
    }))
    const wrapper = await mountSuspended(LiffHistory)
    await settle()

    expect(wrapper.text()).toContain('ปฐมนิเทศน์นักศึกษาใหม่')
    expect(wrapper.text()).toContain('เข้าร่วม')
    expect(wrapper.text()).not.toContain('ยังไม่มีประวัติการเช็คชื่อ')
    expect(wrapper.find('a[href="/liff/activities/act1"]').exists()).toBe(true)
  })
})
