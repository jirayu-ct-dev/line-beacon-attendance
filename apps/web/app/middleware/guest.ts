/** Already-authenticated users have nothing to do on /login. */
export default defineNuxtRouteMiddleware(() => {
  const { user } = useAuth()
  if (user.value) {
    return navigateTo('/dashboard', { replace: true })
  }
})
