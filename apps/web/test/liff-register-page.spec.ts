import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LiffRegister from '~/pages/liff/register.vue'

// The LIFF SDK is mocked — no LINE round trip in tests.
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

const mountPage = async () => {
  const wrapper = await mountSuspended(LiffRegister)
  await settle()
  return wrapper
}

describe('liff register page', () => {
  beforeEach(() => {
    // Simulate the client plugin having initialized the SDK successfully.
    liffState().value = { status: 'ready', isInClient: true, isLoggedIn: true }
    // Fresh shared session (useLiffSession) — pages read it, they don't bootstrap.
    useState('liff:session').value = { token: null, me: null, loading: true, error: null }
    registerEndpoint('/api/v1/me', () => ({ success: true, data: { linked: false, student: null, line: null } }))
    registerEndpoint('/api/v1/line/link', () => ({ success: true, data: { linked: true, student: null, line: null } }))
  })

  it('renders visible labels and the ค.ศ. help text', async () => {
    const wrapper = await mountPage()

    const labels = wrapper.findAll('label').map((label) => label.text())
    expect(labels).toContain('รหัสนักศึกษา')
    expect(labels).toContain('วันเดือนปีเกิด')
    expect(wrapper.text()).toContain('กรอกเป็นปี ค.ศ. เช่น 01012004 (1 มกราคม 2004)')
  })

  it('shows inline Thai validation near the fields on invalid input', async () => {
    const wrapper = await mountPage()

    const [codeInput, birthInput] = wrapper.findAll('input')
    await codeInput.setValue('123')
    await birthInput.setValue('32012004')
    await wrapper.find('form').trigger('submit')
    await settle()

    expect(wrapper.text()).toContain('รหัสนักศึกษาต้องเป็นตัวเลข 12 หลัก')
    expect(wrapper.text()).toContain('วันเดือนปีเกิดไม่ใช่วันที่ที่มีอยู่จริง')
  })

  it('renders the already-linked info state with a link to the profile', async () => {
    registerEndpoint('/api/v1/me', () => ({
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
        line: { lineUserId: 'U123', displayName: null, pictureUrl: null, linkedAt: '2026-08-01T00:00:00.000Z' },
      },
    }))
    const wrapper = await mountPage()

    expect(wrapper.text()).toContain('บัญชี LINE นี้เชื่อมต่ออยู่แล้ว')
    expect(wrapper.text()).toContain('660112230038')
    expect(wrapper.find('a[href="/liff/profile"]').exists()).toBe(true)
  })

  it('shows the dev notice when NUXT_PUBLIC_LIFF_ID is unset', async () => {
    liffState().value = { status: 'unconfigured', isInClient: false, isLoggedIn: false }
    const wrapper = await mountPage()

    expect(wrapper.text()).toContain('ยังไม่ได้ตั้งค่า LIFF')
    expect(wrapper.text()).toContain('NUXT_PUBLIC_LIFF_ID')
  })
})
