import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { messagingApi } from '@line/bot-sdk'
import { LINE_MESSAGING_CLIENT } from './line-notification.service'
import { LineNotificationService } from './line-notification.service'
import { BeaconEventService } from './beacon-event.service'
import { LineWebhookController } from './line-webhook.controller'
import { LineWebhookService } from './line-webhook.service'

/**
 * LINE integration (Phase 4a): webhook pipeline + notification service
 * (spec §9/§10/§20/§36). The LIFF link/unlink endpoints and the attendance
 * engine arrive in Phase 4b/Phase 7.
 */
@Module({
  controllers: [LineWebhookController],
  providers: [
    LineWebhookService,
    BeaconEventService,
    LineNotificationService,
    {
      // Null when LINE_CHANNEL_ACCESS_TOKEN is unset (dev without an Official
      // Account) — the notification service then skips sends gracefully.
      // Tests override this token with a jest mock; nothing ever hits the
      // network in tests.
      provide: LINE_MESSAGING_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): messagingApi.MessagingApiClient | null => {
        const channelAccessToken = config.get<string | undefined>('LINE_CHANNEL_ACCESS_TOKEN')
        if (!channelAccessToken) return null
        return new messagingApi.MessagingApiClient({ channelAccessToken })
      },
    },
  ],
  // Phase 7's attendance engine reuses the notification service (spec §20).
  exports: [LineNotificationService],
})
export class LineModule {}
