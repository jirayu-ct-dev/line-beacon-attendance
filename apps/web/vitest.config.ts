import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    environment: 'nuxt',
    // setupNuxt in the nuxt environment can exceed the 10s default on slower
    // machines (observed flakes), which would fail a whole spec file.
    hookTimeout: 60_000,
  },
})
