import { INestApplication } from '@nestjs/common'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Writes the OpenAPI document consumed by `pnpm gen:api` (design doc §3/D5:
 * @nestjs/swagger → OpenAPI JSON → openapi-typescript for the web app).
 *
 * AppModule is imported dynamically AFTER the env default below: importing it
 * evaluates ConfigModule.forRoot(), which runs env.validation immediately —
 * and codegen must not require a real .env or a running Postgres. The module
 * is compiled for metadata only and never initialized, so no lifecycle hook
 * runs; PrismaService is stubbed as defense-in-depth on top (the real service
 * connects in onModuleInit).
 */
async function main(): Promise<void> {
  // env.validation fail-fast check — codegen never signs anything with it
  process.env.JWT_SECRET ??= 'gen-api-only-secret-0123456789'

  const { Test } = await import('@nestjs/testing')
  const { AppModule } = await import('../src/app.module')
  const { configureApp } = await import('../src/app.setup')
  const { PrismaService } = await import('../src/prisma/prisma.service')

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue({})
    .compile()
  const app: INestApplication = moduleRef.createNestApplication()
  configureApp(app) // global prefix → /api/v1 paths in the document

  const { DocumentBuilder, SwaggerModule } = await import('@nestjs/swagger')
  const config = new DocumentBuilder()
    .setTitle('LINE Beacon Attendance API')
    .setDescription('REST API for the LINE Beacon Attendance Management System')
    .setVersion('0.1.0')
    .build()

  const target = resolve(process.argv[2] ?? '../web/openapi.json')
  writeFileSync(target, `${JSON.stringify(SwaggerModule.createDocument(app, config), null, 2)}\n`)
  await app.close()
  console.log(`OpenAPI document written to ${target}`)
}

void main()
