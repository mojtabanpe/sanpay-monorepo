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
 * هتل‌یار نه امضای دیجیتال می‌فرستد و نه جایی برای تنظیم هدر دلخواه دارد —
 * طبق بخش ۱۴ داکیومنت تنها چیزی که به آن‌ها می‌دهیم یک **آدرس** است. پس راز
 * را در همان آدرس می‌گذاریم: `/api/tourism/webhook/<secret>`. مقایسه
 * timing-safe است چون این تنها چیزی است که بین اینترنت و برگرداندن اعتبار به
 * کیف پول کارمند ایستاده.
 *
 * هدر `X-Webhook-Token` (و `Authorization: Bearer`) هم پذیرفته می‌شود تا اگر
 * روزی هتل‌یار هدر فرستاد، آدرسِ بدون راز هم کار کند.
 *
 * **راز در URL یعنی در لاگ دسترسی وب‌سرور و پراکسی می‌نشیند.** پذیرفته‌ایم
 * چون جایگزینی نیست؛ در استقرار، لاگ کردن query/path این مسیر را خاموش کنید
 * و راز را دوره‌ای عوض کنید (عوض‌کردنش یعنی اعلام آدرس جدید به هتل‌یار).
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
  // راه اصلی: راز به‌عنوان بخشی از آدرسی که به هتل‌یار داده‌ایم
  const fromPath = (request.params as Record<string, string | undefined>)
    ?.secret;
  if (fromPath) {
    return fromPath;
  }
  // ?token=… برای وقتی هتل‌یار فقط query را نگه می‌دارد
  const fromQuery = request.query?.['token'];
  if (typeof fromQuery === 'string' && fromQuery) {
    return fromQuery;
  }
  const header = request.header('x-webhook-token');
  if (header) {
    return header;
  }
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
