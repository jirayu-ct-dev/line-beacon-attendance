import { Controller, Headers, HttpCode, HttpStatus, Post, RawBodyRequest, Req } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { Request } from 'express'
import { Public } from '../../common/auth/public.decorator'
import { LineWebhookService } from './line-webhook.service'

/**
 * LINE Messaging API webhook (spec §35, §36). No JWT — auth is the
 * x-line-signature HMAC over the raw body, verified by LineWebhookService
 * before anything else. The controller stays thin per §36; it answers 200 as
 * soon as the service has verified + persisted the events.
 */
@Public()
@ApiTags('line')
@Controller('line')
export class LineWebhookController {
  constructor(private readonly webhooks: LineWebhookService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  // Rate limit per design doc §3 (throttler covers /line/webhook) — generous,
  // because LINE delivers bursts when many students enter a beacon's range at
  // once and each delivery may batch several events.
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  @ApiOperation({
    summary: 'LINE webhook (beacon events)',
    description:
      'Signature-verified LINE callback. Always answers 200 once the signature is valid and events are persisted; processing continues in the background (spec §36).',
  })
  async webhook(
    @Headers('x-line-signature') signature: string | undefined,
    // The raw bytes are what the signature is computed over — no DTO/body
    // validation: LINE's payload authenticity is proven by the signature and
    // the service parses defensively.
    @Req() request: RawBodyRequest<Request>,
  ): Promise<void> {
    await this.webhooks.handleWebhook(request.rawBody, signature)
  }
}
