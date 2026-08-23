/**
 * Resolve the authenticated user once on the client at app init so the auth
 * state survives page refreshes. SSR cannot do this: the auth cookies are
 * path-scoped to /api/v1 and are never sent with page requests.
 *
 * A hard reload of a protected page therefore lands an authenticated user on
 * /login via the SSR redirect first — recover here by sending them back to
 * their intended page once the client knows who they are.
 *
 * The recovery must run after hydration (onNuxtReady): resolving the user and
 * navigating away from the SSR-rendered /login any earlier renders the
 * dashboard shell against the login page's DOM — a hydration mismatch.
 */
export default defineNuxtPlugin(() => {
  onNuxtReady(async () => {
    const route = useRoute()
    // /liff/* is the student world (design doc §6.5): students hold a LINE ID
    // token, never a dashboard session. Resolving the dashboard user there is
    // a guaranteed 401 and would bounce the student to the admin /login.
    if (route.path.startsWith('/liff/')) return
    const { user, fetchUser } = useAuth()
    if (!user.value) {
      await fetchUser()
    }
    if (user.value && route.path === '/login') {
      await navigateTo(resolveSafeRedirect(route.query.redirect), { replace: true })
    }
  })
})
