import 'dotenv/config'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { Logger } from 'nestjs-pino'
import { AppModule } from './app.module'
import { configureApp } from './app.setup'

async function bootstrap(): Promise<void> {
  // rawBody: the LINE webhook signature is an HMAC over the exact request
  // bytes — Nest keeps a copy of the unparsed buffer on request.rawBody
  // (design doc §5.1 step 1). Integration tests pass the same option to
  // createNestApplication().
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true })
  app.useLogger(app.get(Logger))
  app.enableShutdownHooks()
  configureApp(app)

  const swaggerConfig = new DocumentBuilder()
    .setTitle('LINE Beacon Attendance API')
    .setDescription('REST API for the LINE Beacon Attendance Management System')
    .setVersion('0.1.0')
    .build()
  SwaggerModule.setup('api/v1/docs', app, SwaggerModule.createDocument(app, swaggerConfig))

  await app.listen(process.env.PORT ?? 4000, '0.0.0.0')
}

void bootstrap()
