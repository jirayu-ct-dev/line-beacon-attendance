import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import DashboardPage from '~/pages/dashboard.vue'
import OrganizersPage from '~/pages/admin/organizers.vue'
import { useAuth } from '~/composables/useAuth'
import type { ApiEnvelope, DashboardStats, Paginated, UserRow, UserProfile } from '~/utils/api'

const admin: UserProfile = { id: 'u1', email: 'admin@example.com', username: 'admin', role: 'ADMIN' }

const dashboard: DashboardStats = {
  today: { activities: 2, checkins: 8, present: 6, late: 2 },
  totalActivities: 9,
  recentActivities: [
    { id: 'a1', name: 'Orientation 2026', startAt: '2026-09-01T13:00:00.000Z', status: 'PUBLISHED', timeState: 'CHECKIN_OPEN' },
  ],
  openCheckinActivities: [
    { id: 'a1', name: 'Git & GitHub Workshop', checkinOpenAt: '2026-09-01T12:30:00.000Z', lateAt: '2026-09-01T14:00:00.000Z', checkinCloseAt: '2026-09-01T15:00:00.000Z', present: 4, late: 1 },
  ],
}

describe('dashboard page', () => {
  beforeEach(() => {
    registerEndpoint('/api/v1/auth/me', () => ({ success: true, data: admin }))
    useAuth().user.value = admin
  })

  it('renders the §23/§45 stat cards and the two activity lists', async () => {
    registerEndpoint('/api/v1/dashboard', () => ({ success: true, data: dashboard }))
    const wrapper = await mountSuspended(DashboardPage)
    await flushPromises()

    for (const label of ['กิจกรรมวันนี้', 'ผู้เข้าร่วมวันนี้', 'เข้าร่วม (Present)', 'มาสาย (Late)', 'กิจกรรมทั้งหมด']) {
      expect(wrapper.text()).toContain(label)
    }
    expect(wrapper.text()).toContain('Git & GitHub Workshop')
    expect(wrapper.text()).toContain('เข้าร่วม 4')
    expect(wrapper.text()).toContain('มาสาย 1')
    expect(wrapper.text()).toContain('Orientation 2026')
    expect(wrapper.text()).toContain('อัปเดตอัตโนมัติทุก 30 วินาที')
  })

  it('renders an error state with retry when the API fails', async () => {
    registerEndpoint('/api/v1/dashboard', () => {
      throw createError({ statusCode: 500, statusMessage: 'boom' })
    })
    const wrapper = await mountSuspended(DashboardPage)
    await flushPromises()

    expect(wrapper.text()).toContain('ลองอีกครั้ง')
  })
})

describe('admin organizers page', () => {
  const user = (overrides: Partial<UserRow> = {}): UserRow => ({
    id: 'u2',
    email: 'org@example.com',
    username: 'somorganizer',
    role: 'ORGANIZER',
    status: 'ACTIVE',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  })

  beforeEach(() => {
    registerEndpoint('/api/v1/auth/me', () => ({ success: true, data: admin }))
    useAuth().user.value = admin
  })

  it('renders user rows with role/status labels, self marker and actions', async () => {
    registerEndpoint('/api/v1/users', () => ({
      success: true,
      data: { items: [user(), user({ id: 'u1', username: 'admin', role: 'ADMIN', status: 'INACTIVE' })], total: 2, page: 1, pageSize: 20 },
    }) as ApiEnvelope<Paginated<UserRow>>)
    const wrapper = await mountSuspended(OrganizersPage)
    await flushPromises()

    expect(wrapper.text()).toContain('somorganizer')
    expect(wrapper.text()).toContain('ผู้จัดกิจกรรม')
    expect(wrapper.text()).toContain('ผู้ดูแลระบบ')
    expect(wrapper.text()).toContain('ใช้งาน')
    expect(wrapper.text()).toContain('คุณ') // self badge

    const iconButtons = wrapper.findAll('button[aria-label]')
    expect(iconButtons.some((b) => b.attributes('aria-label') === 'ปิดใช้งานบัญชี somorganizer')).toBe(true)
    expect(iconButtons.some((b) => b.attributes('aria-label') === 'ตั้งรหัสผ่านใหม่ของ somorganizer')).toBe(true)
  })

  it('renders an access-denied state on 403', async () => {
    registerEndpoint('/api/v1/users', () => {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
    })
    const wrapper = await mountSuspended(OrganizersPage)
    await flushPromises()

    expect(wrapper.text()).toContain('ไม่มีสิทธิ์เข้าถึง')
  })
})
