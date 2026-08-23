import { BadRequestException, Module, ValidationPipe } from '@nestjs/common'
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { LoggerModule } from 'nestjs-pino'
import { JwtAuthGuard } from './common/auth/jwt-auth.guard'
import { RolesGuard } from './common/auth/roles.guard'
import { GlobalExceptionFilter } from './common/http/global-exception.filter'
import { ResponseInterceptor } from './common/http/response.interceptor'
import { validateEnv } from './config/env.validation'
import { HealthController } from './health/health.controller'
import { AuditModule } from './modules/audit/audit.module'
import { AuthModule } from './modules/auth/auth.module'
import { ActivitiesModule } from './modules/activities/activities.module'
import { AttendanceModule } from './modules/attendance/attendance.module'
import { BeaconLogsModule } from './modules/beacon-logs/beacon-logs.module'
import { BeaconsModule } from './modules/beacons/beacons.module'
import { LineModule } from './modules/line/line.module'
import { StudentsModule } from './modules/students/students.module'
import { PrismaModule } from './prisma/prisma.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Request logging (spec §49): never log secrets — auth/cookie headers and
    // password fields are redacted; bodies are not logged by default.
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers["set-cookie"]',
            'req.body.password',
          ],
          censor: '[REDACTED]',
        },
      },
    }),
    // Global rate limit default (spec §30.8); /auth/login overrides to 10/min
    ThrottlerModule.forRootAsync({
      useFactory: (configService: ConfigService) => [
        {
          ttl: Number(configService.get('THROTTLER_TTL_MS', '60000')),
          limit: Number(configService.get('THROTTLER_LIMIT', '100')),
        },
      ],
      inject: [ConfigService],
    }),
    PrismaModule,
    AuthModule,
    AuditModule,
    StudentsModule,
    BeaconsModule,
    BeaconLogsModule,
    ActivitiesModule,
    AttendanceModule,
    LineModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        // transform: DTOs get real class instances so @Type(() => Number) can
        // coerce query-string pagination numbers (page/pageSize/year).
        transform: true,
        // Thai-friendly validation errors listing the offending fields (§48)
        exceptionFactory: (errors) =>
          new BadRequestException(`กรุณาตรวจสอบข้อมูล: ${[...new Set(errors.map((e) => e.property))].join(', ')}`),
      }),
    },
    // Order matters: throttler -> JWT -> roles
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule {}
