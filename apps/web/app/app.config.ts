export default defineAppConfig({
  ui: {
    colors: {
      // Semantic color tokens (design doc §6.2) mapped to Tailwind v4 palettes.
      // Components use `primary`, `secondary`, `success`, `warning`, `error`,
      // `info`, `neutral`; the CSS variable mapping lives in app/assets/css/main.css.
      primary: 'emerald',
      secondary: 'sky',
      success: 'emerald',
      warning: 'amber',
      error: 'red',
      info: 'sky',
      neutral: 'slate',
    },
  },
})
