import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { messagingApi } from '@line/bot-sdk'
import { LINE_MESSAGING_CLIENT } from './line-notification.service'
import { LineNotificationService } from './line-notification.service'
import { BeaconEventService } from './beacon-event.service'
import { LineWebhookController } from './line-webhook.controller'
import { LineWebhookService } from './line-webhook.service'
import { LineLinkController } from './line-link.controller'
import { MeController } from './me.controller'
import { LineLinkService } from './line-link.service'
import { LineTokenService, LINE_OIDC_DISCOVERY, LINE_OIDC_DISCOVERY_URL } from './line-token.service'

/**
 * LINE integration: webhook pipeline + notification service (Phase 4a) and
 * LIFF authentication + account linking + student /me endpoints (Phase 4b,
 * spec §7.1/§35). The attendance engine arrives in Phase 7.
 */
@Module({
  controllers: [LineWebhookController, LineLinkController, MeController],
  providers: [
    LineWebhookService,
    BeaconEventService,
    LineNotificationService,
    LineLinkService,
    LineTokenService,
    {
      // LINE's OIDC discovery URL — a DI token so unit tests can point the
      // verification at a local JWKS server instead of the real LINE endpoint.
      provide: LINE_OIDC_DISCOVERY,
      useValue: LINE_OIDC_DISCOVERY_URL,
    },
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
