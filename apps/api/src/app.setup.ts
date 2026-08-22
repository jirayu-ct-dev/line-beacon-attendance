import { INestApplication } from '@nestjs/common'
import cookieParser from 'cookie-parser'

/**
 * App-level configuration shared by main.ts (bootstrap) and integration tests,
 * so tests exercise the same prefix/cookie middleware as production.
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api/v1')
  app.use(cookieParser())
}
