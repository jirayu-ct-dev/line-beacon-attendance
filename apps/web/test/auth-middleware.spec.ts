import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import type { UserProfile } from '~/utils/api'
import { useAuth } from '~/composables/useAuth'
import authMiddleware from '~/middleware/auth'
import guestMiddleware from '~/middleware/guest'

const admin: UserProfile = { id: 'u1', email: 'admin@example.com', username: 'admin', role: 'ADMIN' }

const asRoute = (fullPath: string) => ({ fullPath }) as Parameters<typeof authMiddleware>[0]

/**
 * Runs a middleware the way the router does: with the Nuxt app flagged as
 * "processing middleware", so `navigateTo` returns the redirect target instead
 * of driving the real router.
 */
const runMiddleware = async <T>(fn: () => Promise<T>): Promise<T> => {
  const nuxtApp = useNuxtApp()
  const previous = nuxtApp._processingMiddleware
  nuxtApp._processingMiddleware = true
  try {
    return await fn()
  } finally {
    nuxtApp._processingMiddleware = previous
  }
}

describe('route middleware', () => {
  it('auth: redirects a guest to /login preserving the target path', async () => {
    const wrapper = await mountSuspended({
      async setup() {
        useAuth().user.value = null
        return {
          result: await runMiddleware(() => authMiddleware(asRoute('/dashboard'), asRoute('/'))),
        }
      },
      template: '<div />',
    })

    expect(wrapper.setupState.result).toEqual({
      path: '/login',
      query: { redirect: '/dashboard' },
      replace: true,
    })
  })

  it('auth: lets an authenticated user through', async () => {
    const wrapper = await mountSuspended({
      async setup() {
        useAuth().user.value = admin
        return {
          result: await runMiddleware(() => authMiddleware(asRoute('/dashboard'), asRoute('/'))),
        }
      },
      template: '<div />',
    })

    expect(wrapper.setupState.result).toBeUndefined()
  })

  it('guest: sends an authenticated user to /dashboard', async () => {
    const wrapper = await mountSuspended({
      async setup() {
        useAuth().user.value = admin
        return {
          result: await runMiddleware(() => guestMiddleware(asRoute('/login'), asRoute('/dashboard'))),
        }
      },
      template: '<div />',
    })

    expect(wrapper.setupState.result).toEqual({ path: '/dashboard', replace: true })
  })

  it('guest: keeps a guest on /login', async () => {
    const wrapper = await mountSuspended({
      async setup() {
        useAuth().user.value = null
        return {
          result: await runMiddleware(() => guestMiddleware(asRoute('/login'), asRoute('/'))),
        }
      },
      template: '<div />',
    })

    expect(wrapper.setupState.result).toBeUndefined()
  })
})
