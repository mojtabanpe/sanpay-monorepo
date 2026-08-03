import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';

/**
 * تنها محافظ اندپوینت webhook هتل‌یار.
 *
 * هتل‌یار امضای دیجیتال نمی‌فرستد؛ چیزی که داریم یک رمز مشترک است که هنگام
 * ثبت آدرس webhook به آن‌ها می‌دهیم و در هدر `X-Webhook-Token` برمی‌گردد.
 * مقایسه‌اش timing-safe است چون این تنها چیزی است که بین اینترنت و برگرداندن
 * اعتبار به کیف پول کارمند ایستاده.
 *
 * اگر `GDS_WEBHOOK_SECRET` تنظیم نشده باشد اندپوینت **بسته** است — مگر در حالت
 * `GDS_MODE=mock` که برای تست محلی باز می‌ماند و لاگ هشدار می‌دهد.
 */
@Injectable()
export class GdsWebhookGuard implements CanActivate {
  private readonly logger = new Logger(GdsWebhookGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const secret = process.env.GDS_WEBHOOK_SECRET ?? '';
    const request = context.switchToHttp().getRequest<Request>();
    const token = readToken(request);

    if (!secret) {
      if (process.env.GDS_MODE === 'mock') {
        this.logger.warn(
          'GDS_WEBHOOK_SECRET تنظیم نشده — اندپوینت webhook فقط چون GDS_MODE=mock است باز مانده',
        );
        return true;
      }
      this.logger.error(
        'GDS_WEBHOOK_SECRET تنظیم نشده — رویداد webhook رد شد',
      );
      throw new UnauthorizedException();
    }

    if (!token || !safeEqual(token, secret)) {
      this.logger.warn('رویداد webhook با توکن نامعتبر رد شد');
      throw new UnauthorizedException();
    }
    return true;
  }
}

function readToken(request: Request): string {
  const header = request.header('x-webhook-token');
  if (header) {
    return header;
  }
  // اگر هتل‌یار نتوانست هدر دلخواه بفرستد، Bearer هم پذیرفته می‌شود
  const authorization = request.header('authorization') ?? '';
  return authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // timingSafeEqual روی طول نابرابر پرتاب می‌کند؛ خودِ طول راز نیست
  return left.length === right.length && timingSafeEqual(left, right);
}
