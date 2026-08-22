/** Only same-app paths are honoured; anything else (e.g. '//' open redirects) falls back. */
export const resolveSafeRedirect = (redirect: unknown): string =>
  typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')
    ? redirect
    : '/dashboard'
