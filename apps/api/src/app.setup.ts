import { INestApplication } from '@nestjs/common'
import cookieParser from 'cookie-parser'

/**
 * App-level configuration shared by main.ts (bootstrap) and integration tests,
 * so tests exercise the same prefix/cookie middleware as production.
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api/v1')
  app.use(cookieParser())
  // CORS (spec §30.12): the dashboard reaches the API same-origin through the
  // Nuxt proxy, so this only matters for direct browser access — credentials
  // are required because auth travels as httpOnly cookies.
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  })
}
