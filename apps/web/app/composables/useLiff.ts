/**
 * LIFF (LINE Front-end Framework) state for the student pages (design doc §6.5).
 *
 * liff.client.ts initializes on /liff/* routes; pages consume this composable.
 * The LIFF SDK is imported lazily (client only) so it never loads for the
 * dashboard. The ID token returned by getIdToken() is sent as a Bearer token to
 * /api/v1/line/* and /api/v1/me* and is never logged.
 */

export type LiffStatus = 'initializing' | 'ready' | 'error' | 'unconfigured'

interface LiffState {
  status: LiffStatus
  /** Snapshotted right after a successful init (init resolves login state). */
  isInClient: boolean
  isLoggedIn: boolean
}

/** Module-scoped SDK singleton (client only; module cache makes re-imports free). */
let liffModule: (typeof import('@line/liff'))['default'] | null = null

export const useLiff = () => {
  const state = useState<LiffState>('liff:state', () => ({
    status: 'initializing',
    isInClient: false,
    isLoggedIn: false,
  }))

  const getLiff = async (): Promise<(typeof import('@line/liff'))['default']> => {
    liffModule ??= (await import('@line/liff')).default
    return liffModule
  }

  /**
   * Initializes the LIFF SDK. Safe to call again (retry button on error).
   * - LIFF id unset → 'unconfigured' (dev notice without a LIFF app)
   * - init throws → 'error'
   */
  const start = async (): Promise<void> => {
    if (import.meta.server) return
    const liffId = useRuntimeConfig().public.liffId
    if (!liffId) {
      state.value = { status: 'unconfigured', isInClient: false, isLoggedIn: false }
      return
    }
    state.value = { ...state.value, status: 'initializing' }
    try {
      const liff = await getLiff()
      await liff.init({ liffId })
      state.value = { status: 'ready', isInClient: liff.isInClient(), isLoggedIn: liff.isLoggedIn() }
    } catch (error) {
      // Config/network problems only — never log tokens (none exist here).
      console.error('[liff] init failed', error)
      state.value = { status: 'error', isInClient: false, isLoggedIn: false }
    }
  }

  /**
   * The verified-by-backend LINE ID Token for API calls, or null when there is
   * none (not initialized / not logged in — external browser case).
   */
  const getIdToken = async (): Promise<string | null> => {
    if (state.value.status !== 'ready') return null
    const liff = await getLiff()
    return liff.isLoggedIn() ? liff.getIDToken() : null
  }

  /** Redirects through LINE Login (external browser) and back to the same page. */
  const login = async (): Promise<void> => {
    const liff = await getLiff()
    liff.login({ redirectUri: window.location.href })
  }

  return {
    state,
    status: computed(() => state.value.status),
    isInClient: computed(() => state.value.isInClient),
    isLoggedIn: computed(() => state.value.isLoggedIn),
    start,
    getIdToken,
    login,
  }
}
