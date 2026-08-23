import type { MeResponse } from '~/utils/api'

/**
 * Shared LIFF session for the student shell (design doc §6.5): resolves the
 * LINE ID Token + GET /me once per app load and shares the result between the
 * liff layout (header avatar) and every /liff page — replacing the bootstrap
 * that register/profile used to duplicate. Idempotent: `ensure` is a no-op
 * once a token is resolved, so the layout and pages can both call it.
 */
interface LiffSessionState {
  /** Bearer token for /me* and /line/* calls — null until LIFF is ready and logged in. */
  token: string | null
  me: MeResponse | null
  loading: boolean
  /** Non-null when GET /me failed (retryable via `reload`). */
  error: string | null
}

export const useLiffSession = () => {
  const { status, getIdToken } = useLiff()
  const { request } = useLiffApi()

  const state = useState<LiffSessionState>('liff:session', () => ({
    token: null,
    me: null,
    loading: true,
    error: null,
  }))

  /** Resolves the session once LIFF is ready. A failed /me is retryable, not fatal. */
  const ensure = async (): Promise<void> => {
    if (status.value !== 'ready' || state.value.token) return
    state.value = { ...state.value, loading: true, error: null }
    try {
      const token = await getIdToken()
      state.value.token = token
      if (!token) return // external browser, not logged in -> login prompt
      state.value.me = await request<MeResponse>('/me', { token })
    } catch {
      state.value.error = 'โหลดข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง'
    } finally {
      state.value.loading = false
    }
  }

  /** Full re-fetch — after linking/unlinking changes the /me answer. */
  const reload = async (): Promise<void> => {
    state.value = { token: null, me: null, loading: true, error: null }
    await ensure()
  }

  return {
    token: computed(() => state.value.token),
    me: computed(() => state.value.me),
    loading: computed(() => state.value.loading),
    error: computed(() => state.value.error),
    linked: computed(() => state.value.me?.linked ?? false),
    ensure,
    reload,
  }
}
