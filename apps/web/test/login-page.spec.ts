import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import LoginPage from '~/pages/login.vue'

describe('login page', () => {
  it('renders visible labels for both fields', async () => {
    registerEndpoint('/api/v1/auth/me', () => ({ success: true, data: null }))
    const wrapper = await mountSuspended(LoginPage)

    const labelTexts = wrapper.findAll('label').map((label) => label.text())
    expect(labelTexts).toContain('ชื่อผู้ใช้หรืออีเมล')
    expect(labelTexts).toContain('รหัสผ่าน')
  })

  it('shows inline Thai validation messages on empty submit', async () => {
    registerEndpoint('/api/v1/auth/me', () => ({ success: true, data: null }))
    const loginHandler = vi.fn(() => ({ success: true, data: null }))
    registerEndpoint('/api/v1/auth/login', { method: 'POST', handler: loginHandler })
    const wrapper = await mountSuspended(LoginPage)

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('กรุณากรอกชื่อผู้ใช้หรืออีเมล')
    expect(text).toContain('กรุณากรอกรหัสผ่าน')
    expect(loginHandler).not.toHaveBeenCalled()
  })

  it('disables the submit button while the login request is processing', async () => {
    registerEndpoint('/api/v1/auth/me', () => ({ success: true, data: null }))
    // Never resolves: keeps the form in its processing state.
    registerEndpoint('/api/v1/auth/login', {
      method: 'POST',
      handler: () => new Promise(() => {}),
    })
    const wrapper = await mountSuspended(LoginPage)

    const inputs = wrapper.findAll('input')
    await inputs[0]!.setValue('admin')
    await inputs[1]!.setValue('change-me-admin')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const submitButton = wrapper.find('button[type="submit"]')
    expect(submitButton.attributes('disabled')).toBeDefined()
  })
})
