import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LiffProfile from '~/pages/liff/profile.vue'

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

const mePayload = {
  success: true,
  data: {
    linked: true,
    student: {
      id: 's1',
      studentCode: '660112230038',
      firstName: 'สมชาย',
      lastName: 'ใจดี',
      birthDate: '2004-01-01',
      year: 3,
      email: null,
      status: 'ACTIVE',
    },
    line: {
      lineUserId: 'U123',
      displayName: 'สมชาย LINE',
      pictureUrl: null,
      linkedAt: '2026-08-01T00:00:00.000Z',
    },
  },
}

describe('liff profile page', () => {
  beforeEach(() => {
    liffState().value = { status: 'ready', isInClient: true, isLoggedIn: true }
    registerEndpoint('/api/v1/me', () => mePayload)
  })

  it('renders the student card and the empty attendance state', async () => {
    registerEndpoint('/api/v1/me/attendances', () => ({
      success: true,
      data: { items: [], total: 0, page: 1, pageSize: 20 },
    }))
    const wrapper = await mountSuspended(LiffProfile)
    await settle()

    expect(wrapper.text()).toContain('สมชาย LINE')
    expect(wrapper.text()).toContain('660112230038')
    expect(wrapper.text()).toContain('ชั้นปี 3')
    expect(wrapper.text()).toContain('ประวัติการเช็คชื่อ')
    expect(wrapper.text()).toContain('ยังไม่มีประวัติการเช็คชื่อ')
  })

  it('renders attendance cards with status labels', async () => {
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
        pageSize: 20,
      },
    }))
    const wrapper = await mountSuspended(LiffProfile)
    await settle()

    expect(wrapper.text()).toContain('ปฐมนิเทศน์นักศึกษาใหม่')
    expect(wrapper.text()).toContain('เข้าร่วม')
    expect(wrapper.text()).not.toContain('ยังไม่มีประวัติการเช็คชื่อ')
  })

  it('offers the unlink action (confirm-gated per project standards)', async () => {
    registerEndpoint('/api/v1/me/attendances', () => ({
      success: true,
      data: { items: [], total: 0, page: 1, pageSize: 20 },
    }))
    const wrapper = await mountSuspended(LiffProfile)
    await settle()

    const button = wrapper.findAll('button').find((b) => b.text().includes('ยกเลิกการเชื่อมบัญชี LINE'))
    expect(button).toBeDefined()
  })
})
