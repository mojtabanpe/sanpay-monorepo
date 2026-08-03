import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { GdsWebhookGuard } from './gds-webhook.guard';
import { GdsWebhookEventPayload } from './gds/gds.types';
import {
  TourismWebhookService,
  WebhookResult,
} from './tourism-webhook.service';

/**
 * گیرندهٔ webhook هتل‌یار — آدرسی که موقع ثبت‌نام به آن‌ها می‌دهیم:
 * `POST https://<host>/api/tourism/webhook` با هدر `X-Webhook-Token`.
 *
 * برخلاف بقیهٔ اندپوینت‌های گردشگری اینجا JWT کارمند وجود ندارد؛ تنها
 * احراز هویت، رمز مشترک در `GdsWebhookGuard` است.
 */
@Controller('tourism/webhook')
export class TourismWebhookController {
  constructor(private readonly webhook: TourismWebhookService) {}

  /**
   * بدنه عمداً DTO کلاسی ندارد: ساختار رویداد را هتل‌یار تعیین می‌کند و
   * `ValidationPipe({whitelist:true})` سطح بالا را می‌تراشید و لاگ خام را
   * ناقص می‌کرد. اعتبارسنجی حداقلی در سرویس انجام می‌شود و بدنه دست‌نخورده
   * در `GdsWebhookEvent.payload` بایگانی می‌شود.
   */
  @Post()
  @UseGuards(GdsWebhookGuard)
  @HttpCode(200)
  handle(@Body() payload: GdsWebhookEventPayload): Promise<WebhookResult> {
    return this.webhook.handle(payload);
  }
}
