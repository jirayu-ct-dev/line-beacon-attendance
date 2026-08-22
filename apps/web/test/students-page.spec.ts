import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import StudentsIndex from '~/pages/students/index.vue'
import { useAuth } from '~/composables/useAuth'
import type { ApiEnvelope, Paginated, Student, UserProfile } from '~/utils/api'

const admin: UserProfile = { id: 'u1', email: 'admin@example.com', username: 'admin', role: 'ADMIN' }

const student = (overrides: Partial<Student> = {}): Student => ({
  id: 's1',
  studentCode: '660112230038',
  firstName: 'Somchai',
  lastName: 'Jaidee',
  birthDate: '2004-01-01',
  year: 3,
  email: null,
  status: 'ACTIVE',
  lineLinked: false,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  ...overrides,
})

const paginated = (items: Student[]): ApiEnvelope<Paginated<Student>> => ({
  success: true,
  data: { items, total: items.length, page: 1, pageSize: 20 },
})

const mountPage = async () => {
  const wrapper = await mountSuspended(StudentsIndex)
  await flushPromises()
  return wrapper
}

describe('students index page', () => {
  beforeEach(() => {
    registerEndpoint('/api/v1/auth/me', () => ({ success: true, data: admin }))
    useAuth().user.value = admin
  })

  it('renders the search input with a visible label and filter selects', async () => {
    registerEndpoint('/api/v1/students', () => paginated([student()]))
    const wrapper = await mountPage()

    const label = wrapper.findAll('label').find((element) => element.text() === 'ค้นหา')
    expect(label).toBeDefined()
    const input = wrapper.find(`#${label!.attributes('for')}`)
    expect(input.exists()).toBe(true)

    expect(wrapper.text()).toContain('สถานะ')
    expect(wrapper.text()).toContain('ชั้นปี')
  })

  it('renders the empty state when there is no data and no filter', async () => {
    registerEndpoint('/api/v1/students', () => paginated([]))
    const wrapper = await mountPage()

    expect(wrapper.text()).toContain('ยังไม่มีข้อมูล')
    expect(wrapper.text()).not.toContain('ไม่พบผลลัพธ์')
  })

  it('renders an access-denied state instead of a broken table on 403', async () => {
    registerEndpoint('/api/v1/students', () => {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
    })
    const wrapper = await mountPage()

    expect(wrapper.text()).toContain('ไม่มีสิทธิ์เข้าถึง')
    expect(wrapper.text()).not.toContain('ยังไม่มีข้อมูล')
  })

  it('renders student rows with status labels and row actions', async () => {
    registerEndpoint('/api/v1/students', () =>
      paginated([student(), student({ id: 's2', studentCode: '660112230039', status: 'INACTIVE', lineLinked: true })]),
    )
    const wrapper = await mountPage()

    expect(wrapper.text()).toContain('660112230038')
    expect(wrapper.text()).toContain('Somchai Jaidee')
    expect(wrapper.text()).toContain('ใช้งาน')
    expect(wrapper.text()).toContain('ปิดใช้งาน')
    expect(wrapper.text()).toContain('เชื่อมต่อแล้ว')
    expect(wrapper.text()).toContain('ยังไม่เชื่อม')

    const iconButtons = wrapper.findAll('button[aria-label]')
    expect(iconButtons.some((button) => button.attributes('aria-label') === 'แก้ไขนักศึกษา 660112230038')).toBe(true)
    expect(iconButtons.some((button) => button.attributes('aria-label') === 'ปิดใช้งานนักศึกษา 660112230038')).toBe(true)
    expect(iconButtons.some((button) => button.attributes('aria-label') === 'เปิดใช้งานนักศึกษา 660112230039')).toBe(true)
  })
})
