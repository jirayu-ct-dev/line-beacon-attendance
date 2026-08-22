// https://nuxt.com/docs/api/configuration/nuxt-config
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
})
