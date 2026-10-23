import { Service, inject } from '@angular/core';
import { AdminGatewayPaymentDetail } from '@sanpay/models';
import { AdminApiService } from './admin-api.service';
import { ConfirmService } from './confirm';
import { toman } from './format';

interface Target {
  id: string;
  amount: number;
  employee: { name: string };
}

const NOTE = {
  label: 'یادداشت بررسی (در سابقهٔ این پرداخت ثبت می‌شود)',
  placeholder: 'مثلاً: در پنل تومان «موفق» بود، شمارهٔ پیگیری ۱۲۳۴۵۶',
  minLength: 5,
};

/**
 * تصمیم‌های دستی صف بررسی UPG — هرکدام پشت `hlm-alert-dialog` با یادداشت
 * اجباری. پول فقط سمت سرور و از همان مسیر callback/cron جابه‌جا می‌شود؛ این‌جا
 * فقط پرسیدن و فرستادن است. `null` یعنی مدیر انصراف داد.
 */
@Service()
export class UpgReviewActions {
  private readonly api = inject(AdminApiService);
  private readonly confirm = inject(ConfirmService);

  async payment(
    payment: Target,
    outcome: 'verified' | 'failed',
  ): Promise<AdminGatewayPaymentDetail | null> {
    const note = await this.confirm.askNote(
      outcome === 'verified'
        ? {
            title: 'پول گرفته شده — تأیید پرداخت',
            description: `فقط وقتی تأیید کنید که در پنل درگاه مطمئن شده‌اید پول گرفته شده است. ${toman(payment.amount)} به ماندهٔ کارتی ${payment.employee.name} واریز می‌شود؛ اگر خرید هنوز منتظر همین پرداخت باشد نهایی می‌شود، وگرنه کارمند می‌تواند مبلغ را از پروفایل به کارت برگرداند.`,
            action: 'تأیید پرداخت',
            note: NOTE,
          }
        : {
            title: 'پولی گرفته نشده — اعلام ناموفق',
            description:
              'پولی جابه‌جا نمی‌شود و پرداخت بسته می‌شود. اگر بعداً معلوم شود پول از کارت کسر شده بود، باید از پنل درگاه به کارت برگردانده شود.',
            action: 'اعلام ناموفق',
            destructive: true,
            note: NOTE,
          },
    );
    if (note === null) return null;
    return this.api.reviewGatewayPayment(payment.id, { outcome, note });
  }

  async refund(
    refund: Target,
    outcome: 'succeeded' | 'failed',
  ): Promise<AdminGatewayPaymentDetail | null> {
    const note = await this.confirm.askNote(
      outcome === 'succeeded'
        ? {
            title: 'پول به کارت رسیده — بستن بازگشت',
            description: `ماندهٔ ${refund.employee.name} هنگام درخواست کسر شده بود؛ با این تأیید فقط بازگشت ${toman(refund.amount)} «موفق» بسته می‌شود و پولی جابه‌جا نمی‌شود.`,
            action: 'اعلام موفق',
            note: NOTE,
          }
        : {
            title: 'پول به کارت نرسیده — اعلام ناموفق',
            description: `${toman(refund.amount)} به ماندهٔ قابل بازگشت ${refund.employee.name} برمی‌گردد و این پرداخت از بازگشت‌های بعدی کنار می‌رود. اگر بازگشت در درگاه ثبت شده باشد، پول دوبار برمی‌گردد — اول پنل درگاه را بررسی کنید.`,
            action: 'اعلام ناموفق',
            destructive: true,
            note: NOTE,
          },
    );
    if (note === null) return null;
    return this.api.reviewGatewayRefund(refund.id, { outcome, note });
  }
}
