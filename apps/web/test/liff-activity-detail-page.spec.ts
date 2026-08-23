import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LiffActivityDetail from '~/pages/liff/activities/[id].vue'

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

describe('liff activity detail page', () => {
  beforeEach(() => {
    liffState().value = { status: 'ready', isInClient: true, isLoggedIn: true }
    useState('liff:session').value = { token: null, me: null, loading: true, error: null }
    registerEndpoint('/api/v1/me', () => ({
      success: true,
      data: { linked: true, student: { id: 's1' }, line: { lineUserId: 'U123' } },
    }))
  })

  it('renders the activity info and the caller’s own attendance', async () => {
    registerEndpoint('/api/v1/me/activities/act1', () => ({
      success: true,
      data: {
        id: 'act1',
        name: 'ปฐมนิเทศน์นักศึกษาใหม่',
        description: 'กิจกรรมต้อนรับนักศึกษาใหม่',
        location: 'ห้องประชุมใหญ่',
        startAt: '2026-09-20T10:00:00.000Z',
        endAt: '2026-09-20T12:00:00.000Z',
        checkinOpenAt: '2026-09-20T08:30:00.000Z',
        lateAt: '2026-09-20T09:15:00.000Z',
        checkinCloseAt: '2026-09-20T11:00:00.000Z',
        timeState: 'COMPLETED',
        myAttendance: { checkInAt: '2026-09-20T09:05:00.000Z', status: 'PRESENT', checkinMethod: 'BEACON' },
      },
    }))
    const wrapper = await mountSuspended(LiffActivityDetail, { route: '/liff/activities/act1' })
    await settle()

    expect(wrapper.text()).toContain('ปฐมนิเทศน์นักศึกษาใหม่')
    expect(wrapper.text()).toContain('ห้องประชุมใหญ่')
    expect(wrapper.text()).toContain('กิจกรรมต้อนรับนักศึกษาใหม่')
    expect(wrapper.text()).toContain('การเช็คชื่อของฉัน')
    expect(wrapper.text()).toContain('เข้าร่วม')
    expect(wrapper.text()).toContain('ผ่าน LINE Beacon')
    expect(wrapper.find('a[href="/liff/activities"]').exists()).toBe(true)
  })

  it('shows the not-yet-checked-in note when the caller has no attendance', async () => {
    registerEndpoint('/api/v1/me/activities/act1', () => ({
      success: true,
      data: {
        id: 'act1',
        name: 'ปฐมนิเทศน์นักศึกษาใหม่',
        description: null,
        location: null,
        startAt: '2026-09-20T10:00:00.000Z',
        endAt: '2026-09-20T12:00:00.000Z',
        checkinOpenAt: '2026-09-20T08:30:00.000Z',
        lateAt: '2026-09-20T09:15:00.000Z',
        checkinCloseAt: '2026-09-20T11:00:00.000Z',
        timeState: 'UPCOMING',
        myAttendance: null,
      },
    }))
    const wrapper = await mountSuspended(LiffActivityDetail, { route: '/liff/activities/act1' })
    await settle()

    expect(wrapper.text()).toContain('ยังไม่ได้เช็คชื่อกิจกรรมนี้')
  })
})
