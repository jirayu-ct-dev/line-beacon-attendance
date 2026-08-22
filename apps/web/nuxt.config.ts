// https://nuxt.com/docs/api/configuration/nuxt-config

// Same-origin proxy target (design doc §6.6). The browser only ever talks to
// this Nuxt server, so the httpOnly auth cookies (Path=/api/v1) stay first-party.
// `API_BASE_URL` is the documented env var (evaluated when the dev server
// starts / at build time for production).
const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:4000'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  devServer: {
    port: 3000,
  },
  modules: ['@nuxt/ui', '@nuxt/icon'],
  css: ['~/assets/css/main.css'],
  icon: {
    clientBundle: {
      // Bundle icons used in app source (e.g. <Icon name="lucide:..." />) so they
      // render synchronously on SSR without a runtime fetch.
      scan: true,
    },
  },
  routeRules: {
    // Proxy /api/** to the NestJS API (dev + prod). Set-Cookie headers pass
    // through untouched, so Path=/api/v1 cookies apply to this same origin.
    '/api/**': {
      proxy: `${apiBaseUrl}/api/**`,
    },
  },
})
