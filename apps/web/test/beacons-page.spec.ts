import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import BeaconsIndex from '~/pages/beacons/index.vue'
import { useAuth } from '~/composables/useAuth'
import type { ApiEnvelope, Beacon, Paginated, UserProfile } from '~/utils/api'

const admin: UserProfile = { id: 'u1', email: 'admin@example.com', username: 'admin', role: 'ADMIN' }
const organizer: UserProfile = { id: 'u2', email: 'org@example.com', username: 'org', role: 'ORGANIZER' }

const beacon = (overrides: Partial<Beacon> = {}): Beacon => ({
  id: 'b1',
  hwid: '32af519e88',
  name: 'CS Room 101',
  location: 'CS101',
  description: null,
  status: 'ACTIVE',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  ...overrides,
})

const paginated = (items: Beacon[]): ApiEnvelope<Paginated<Beacon>> => ({
  success: true,
  data: { items, total: items.length, page: 1, pageSize: 20 },
})

const mountPage = async () => {
  const wrapper = await mountSuspended(BeaconsIndex)
  await flushPromises()
  return wrapper
}

describe('beacons index page', () => {
  beforeEach(() => {
    registerEndpoint('/api/v1/auth/me', () => ({ success: true, data: admin }))
    useAuth().user.value = admin
  })

  it('renders the search input with a visible label and status filter', async () => {
    registerEndpoint('/api/v1/beacons', () => paginated([beacon()]))
    const wrapper = await mountPage()

    const label = wrapper.findAll('label').find((element) => element.text() === 'ค้นหา')
    expect(label).toBeDefined()
    const input = wrapper.find(`#${label!.attributes('for')}`)
    expect(input.exists()).toBe(true)

    expect(wrapper.text()).toContain('สถานะ')
  })

  it('renders the empty state when there is no data and no filter', async () => {
    registerEndpoint('/api/v1/beacons', () => paginated([]))
    const wrapper = await mountPage()

    expect(wrapper.text()).toContain('ยังไม่มีข้อมูล')
    expect(wrapper.text()).not.toContain('ไม่พบผลลัพธ์')
  })

  it('renders beacon rows with status labels and row actions', async () => {
    registerEndpoint('/api/v1/beacons', () => paginated([
      beacon(),
      beacon({ id: 'b2', hwid: '0189d3b1c2', name: 'Library Beacon', status: 'MAINTENANCE' }),
    ]))
    const wrapper = await mountPage()

    expect(wrapper.text()).toContain('32af519e88')
    expect(wrapper.text()).toContain('CS Room 101')
    expect(wrapper.text()).toContain('ใช้งาน')
    expect(wrapper.text()).toContain('ซ่อมบำรุง')

    const iconButtons = wrapper.findAll('button[aria-label]')
    expect(iconButtons.some((button) => button.attributes('aria-label') === 'แก้ไขบีคอน CS Room 101')).toBe(true)
    expect(iconButtons.some((button) => button.attributes('aria-label') === 'ปิดใช้งานบีคอน CS Room 101')).toBe(true)
    // The detail action navigates (:to) so it renders as a NuxtLink anchor.
    const iconLinks = wrapper.findAll('a[aria-label]')
    expect(iconLinks.some((link) => link.attributes('aria-label') === 'ดูรายละเอียดบีคอน Library Beacon')).toBe(true)
  })

  it('hides create and mutation actions from organizers (read-only list)', async () => {
    useAuth().user.value = organizer
    registerEndpoint('/api/v1/beacons', () => paginated([beacon()]))
    const wrapper = await mountPage()

    // The subtitle mentions "ลงทะเบียนบีคอน" too — assert on actual buttons.
    expect(wrapper.findAll('button').some((button) => button.text() === 'ลงทะเบียนบีคอน')).toBe(false)
    const iconButtons = wrapper.findAll('button[aria-label]')
    expect(iconButtons.some((button) => button.attributes('aria-label') === 'แก้ไขบีคอน CS Room 101')).toBe(false)
    expect(iconButtons.some((button) => button.attributes('aria-label') === 'ปิดใช้งานบีคอน CS Room 101')).toBe(false)
    const iconLinks = wrapper.findAll('a[aria-label]')
    expect(iconLinks.some((link) => link.attributes('aria-label') === 'ดูรายละเอียดบีคอน CS Room 101')).toBe(true)
  })
})
