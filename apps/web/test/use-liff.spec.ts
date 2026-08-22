import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { useLiff } from '~/composables/useLiff'

// LIFF SDK mock — the init mock is reconfigured per test.
const initMock = vi.fn(async () => undefined)
vi.mock('@line/liff', () => ({
  default: {
    init: (...args: unknown[]) => initMock(...args),
    isInClient: () => true,
    isLoggedIn: () => true,
    getIDToken: () => 'test-id-token',
    login: vi.fn(),
  },
}))

/** Minimal host component so the composable runs inside a Nuxt setup context. */
const hostFactory = (run: () => void) =>
  defineComponent({
    setup() {
      run()
      return () => h('div')
    },
  })

const mountHost = async (run: () => void) => {
  const wrapper = await mountSuspended(hostFactory(run))
  await flushPromises()
  return wrapper
}

describe('useLiff', () => {
  it("reports 'unconfigured' when NUXT_PUBLIC_LIFF_ID is unset (dev notice state)", async () => {
    const config = useRuntimeConfig()
    const previous = config.public.liffId
    config.public.liffId = ''
    await mountHost(() => {
      void useLiff().start()
    })
    expect(useLiff().status.value).toBe('unconfigured')
    config.public.liffId = previous ?? ''
  })

  it("initializes to 'ready' and exposes the ID token + login flags when configured", async () => {
    const config = useRuntimeConfig()
    const previous = config.public.liffId
    config.public.liffId = 'test-liff-id'
    initMock.mockResolvedValue(undefined)

    await mountHost(() => {
      void useLiff().start()
    })
    await flushPromises()

    const liff = useLiff()
    expect(liff.status.value).toBe('ready')
    expect(liff.isInClient.value).toBe(true)
    expect(liff.isLoggedIn.value).toBe(true)
    await expect(liff.getIdToken()).resolves.toBe('test-id-token')

    config.public.liffId = previous ?? ''
  })

  it("falls into 'error' when liff.init rejects (retryable)", async () => {
    const config = useRuntimeConfig()
    const previous = config.public.liffId
    config.public.liffId = 'test-liff-id'
    initMock.mockRejectedValueOnce(new Error('invalid liff id'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await mountHost(() => {
      void useLiff().start()
    })
    await flushPromises()
    expect(useLiff().status.value).toBe('error')

    // Retry succeeds once init works again.
    initMock.mockResolvedValue(undefined)
    await useLiff().start()
    expect(useLiff().status.value).toBe('ready')

    consoleError.mockRestore()
    config.public.liffId = previous ?? ''
  })
})
