# قرارداد تسویهٔ صنعت‌پی با بانکداری شرکتی تومان

این یادداشت، بخش‌های مورد نیاز پروژه را از مستندات رسمی تومان خلاصه می‌کند. تاریخ بازبینی: ۱۴۰۵/۰۶/۰۴ (2026-08-26).

## جریان اجرا

1. خرید فروشگاهی یا رزرو قطعی هتل همان لحظه از اعتبار کارمند کم می‌شود.
2. ساعت ۰۲:۰۰ به وقت `Asia/Tehran`، بدهی‌های تسویه‌نشده به تفکیک فروشگاه، هتل‌یار و اقامت۲۴ تجمیع می‌شوند.
3. یک batch ساخته می‌شود، آیتم‌ها در بسته‌های حداکثر ۱۰۰۰تایی افزوده و سپس batch، commit می‌شود.
4. نتیجهٔ هر انتقال با `tracker_id` یکتای صنعت‌پی هر ۱۵ دقیقه استعلام می‌شود. فقط وضعیت `6` موفق است و `settledAt` را ثبت می‌کند.

مبالغ دیتابیس صنعت‌پی «تومان» و مبالغ API تومان «ریال» هستند؛ در مرز API مقدار در ۱۰ ضرب می‌شود.

## احراز هویت و دسترسی

- OAuth2 password grant با `application/x-www-form-urlencoded`
- production token: `https://accounts.qbitpay.org/oauth2/token/`
- staging token: `https://auth.qbitpay.org/oauth2/token/`
- scopeهای لازم:
  - `digital_banking.batch_transfer.create`
  - `digital_banking.batch_transfer.read`
  - `digital_banking.transfer.read`
- permissionهای کاربر سازمانی:
  - `corporate-banking:api`
  - `CB:batch_transfer:create:true`
  - `CB:batch_transfer:read:true`
- IP سرور باید در فهرست IPهای مجاز تومان ثبت شود.

اعتبارنامهٔ حساب `cb-jahanfolad-api` در ۱۴۰۵/۰۷/۰۲ فقط روی محیط production
احراز شد؛ endpoint توکن staging آن را با `invalid_client` رد می‌کند. دریافت
توکن production موفق است، اما دسترسی خواندن batch تا زمان فعال‌شدن permission
و ثبت IP مورد اعتماد با HTTP 403 رد می‌شود. اجرای خودکار تسویه تا رفع این مورد
باید با `TOMAN_SETTLEMENTS_ENABLED=false` خاموش بماند.

## endpointهای استفاده‌شده

Base URL اصلی: `https://dbank.toman.ir/api/v1`

- `POST /batch-transfer/` با `max_amount` و `max_transfer_count`
- `POST /batch-transfer/{uuid}/add-items/`
- `POST /batch-transfer/{uuid}/commit/`
- `GET /batch-transfer/{uuid}/`
- `GET /transfer/tracker/{tracker_id}/`

هر آیتم شامل `amount`، `iban_destination`، `tracker_id`، توضیح و `reason=6` (تسویهٔ بدهی) است. `tracker_id` در کل حساب همکار یکتا و حداکثر ۵۰ نویسه است؛ بنابراین نقش idempotency هم دارد.

## وضعیت‌ها و قواعد ایمنی

- batch: `-3 SYSTEM_FAILED`، `-2 FAILED`، `1 INITIATED`، `2 COMMITTED`، `3 PROCESSING`، `4 DONE`
- transfer موفق: `6 TRANSFERRED`
- خطاهای نهایی مورد استفاده: `8, 9, 10, 11, 20, 30, 40, 41`
- وضعیت `12 UNKNOWN` خودکار دوباره پرداخت نمی‌شود و برای بررسی/استعلام بعدی باز می‌ماند.
- انتقال شکست‌خورده به‌صورت خودکار وارد batch جدید نمی‌شود تا ریسک دوباره‌پرداخت وجود نداشته باشد.
- بسته به سیاست حساب بانکی، batch پس از commit ممکن است در پنل تومان به امضا نیاز داشته باشد.
- `TOMAN_MODE=mock` هیچ درخواست مالی واقعی ارسال نمی‌کند. حالت `live` فقط بعد از تنظیم credential، scope، permission، IP مجاز و شباها فعال شود.

## بازیابی ساخت batch ناموفق

در پنل تسویه، برای دستهٔ `FAILED` بدون شناسهٔ تومان و بدون زمان ارسال، دکمهٔ «ادامه ارسال» نمایش داده می‌شود؛ مسیر API آن `POST /api/admin/settlements/:id/resume` و نیازمند دسترسی نوشتن تسویه است. این مسیر تنها وقتی عمل می‌کند که تمام آیتم‌ها هنوز `CREATED` باشند و هیچ شناسه یا زمان ارسال حواله نداشته باشند. همان دسته، خریدها، مبلغ، مقصد و trackerها حفظ می‌شوند و تغییر اتمیک وضعیت به `BUILDING` جلوی اجرای هم‌زمان را می‌گیرد. برای خطای مجوز، ابتدا باید دسترسی حساب اصلاح شده باشد.

این عملیات برای batch دارای شناسهٔ تومان مجاز نیست؛ آن موارد از مسیر استعلام/بازیابی موجود پیگیری می‌شوند. اگر پاسخ ساخت اولیه گم شده باشد، دستهٔ احتمالی قبلی خالی و commit نشده است. حوالهٔ شکست‌خوردهٔ نهایی از دکمهٔ «تلاش مجدد» استفاده می‌کند. هیچ‌کدام از این عملیات به معنی تأیید موفقیت بانکی نیست؛ موفقیت فقط با استعلام نهایی ثبت می‌شود.

## منابع رسمی

- https://docs.tomanpay.net/Authentication/
- https://docs.tomanpay.net/Corporate%20Banking/cb_permissions/
- https://docs.tomanpay.net/Corporate%20Banking/cb_workflow/
- https://docs.tomanpay.net/Corporate%20Banking/cb_apis/
- https://docs.tomanpay.net/Corporate%20Banking/cb_models/
- https://docs.tomanpay.net/Corporate%20Banking/cb_enums/
