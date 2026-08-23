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
    // Fresh shared session (useLiffSession) — pages read it, they don't bootstrap.
    useState('liff:session').value = { token: null, me: null, loading: true, error: null }
    registerEndpoint('/api/v1/me', () => mePayload)
  })

  it('renders the student profile card', async () => {
    const wrapper = await mountSuspended(LiffProfile)
    await settle()

    expect(wrapper.text()).toContain('โปรไฟล์ของฉัน')
    expect(wrapper.text()).toContain('สมชาย LINE')
    expect(wrapper.text()).toContain('660112230038')
    expect(wrapper.text()).toContain('ชั้นปี 3')
  })

  it('offers the unlink action (confirm-gated per project standards)', async () => {
    const wrapper = await mountSuspended(LiffProfile)
    await settle()

    const button = wrapper.findAll('button').find((b) => b.text().includes('ยกเลิกการเชื่อมบัญชี LINE'))
    expect(button).toBeDefined()
  })
})
