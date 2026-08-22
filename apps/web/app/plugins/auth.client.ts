/**
 * Resolve the authenticated user once on the client at app init so the auth
 * state survives page refreshes. SSR cannot do this: the auth cookies are
 * path-scoped to /api/v1 and are never sent with page requests.
 *
 * A hard reload of a protected page therefore lands an authenticated user on
 * /login via the SSR redirect first — recover here by sending them back to
 * their intended page once the client knows who they are.
 */
export default defineNuxtPlugin(async () => {
  const { user, fetchUser } = useAuth()
  if (!user.value) {
    await fetchUser()
  }
  const route = useRoute()
  if (user.value && route.path === '/login') {
    await navigateTo(resolveSafeRedirect(route.query.redirect), { replace: true })
  }
})
