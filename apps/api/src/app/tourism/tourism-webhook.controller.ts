import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { GdsWebhookGuard } from './gds-webhook.guard';
import { GdsWebhookEventPayload } from './providers/hotelyar/gds.types';
import {
  TourismWebhookService,
  WebhookResult,
} from './tourism-webhook.service';

/**
 * گیرندهٔ webhook هتل‌یار. آدرسی که به آن‌ها اعلام می‌کنیم راز را در خودش دارد،
 * چون هتل‌یار جایی برای تنظیم هدر ندارد و فقط یک URL از ما می‌گیرد:
 *
 *   `POST https://<host>/api/tourism/webhook/<GDS_WEBHOOK_SECRET>`
 *
 * مسیر بدون راز (`/api/tourism/webhook`) هم می‌ماند تا اگر هتل‌یار هدر
 * `X-Webhook-Token` بفرستد کار کند؛ گارد در هر دو حالت یکی است.
 *
 * برخلاف بقیهٔ اندپوینت‌های گردشگری اینجا JWT کارمند وجود ندارد؛ تنها
 * احراز هویت، همان رمز مشترک در `GdsWebhookGuard` است.
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
  @Post([':secret', ''])
  @UseGuards(GdsWebhookGuard)
  @HttpCode(200)
  handle(@Body() payload: GdsWebhookEventPayload): Promise<WebhookResult> {
    return this.webhook.handle(payload);
  }
}
