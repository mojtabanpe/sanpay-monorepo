import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

/**
 * پاسخ sms.ir — خطاها هم با HTTP 200 برمی‌گردند و فقط `status` معتبر است،
 * پس نباید صرفاً به کد وضعیت HTTP تکیه کرد.
 */
interface SmsIrResponse {
  status?: number;
  message?: string;
  data?: unknown;
}

const SMS_IR_VERIFY_URL = 'https://api.sms.ir/v1/send/verify';
const SMS_IR_OK_STATUS = 1;
/** نام پارامتر تعریف‌شده در قالبِ (template) پنل sms.ir */
const OTP_PARAMETER_NAME = 'CODE';
const LOGIN_TEMPLATE_ID = 938507;
const PURCHASE_TEMPLATE_ID = 944060;
const LOGIN_NOTICE_TEMPLATE_ID = 723463;
const PAYMENT_NOTICE_TEMPLATE_ID = 279643;
/** قالب‌های تغییر موبایل و رمز فروشگاه؛ متغیر env در صورت وجود جایگزینشان می‌شود */
const PHONE_CHANGE_OTP_TEMPLATE_ID = 672582;
const PHONE_CHANGE_NOTICE_TEMPLATE_ID = 195588;
const STORE_PASSWORD_OTP_TEMPLATE_ID = 403664;

interface SmsParameter {
  name: string;
  value: string;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor() {
    this.logger.log(`SMS mode: ${process.env.SMS_MODE || 'smsir'}`);
  }

  async sendOtp(phone: string, code: string): Promise<void> {
    await this.sendVerify(phone, LOGIN_TEMPLATE_ID, [
      { name: OTP_PARAMETER_NAME, value: code },
    ]);
  }

  async sendPhoneChangeOtp(
    phone: string,
    code: string,
    newPhone: string,
  ): Promise<void> {
    await this.sendVerify(
      phone,
      Number(process.env.SMSIR_PHONE_CHANGE_OTP_TEMPLATE_ID) ||
        PHONE_CHANGE_OTP_TEMPLATE_ID,
      [
        { name: 'CODE', value: code },
        { name: 'NEWPHONE', value: newPhone },
      ],
    );
  }

  /** Await provider acceptance; the phone-change outbox retries failures. */
  async sendPhoneChangeNotice(
    phone: string,
    oldPhone: string,
    newPhone: string,
    at: Date,
  ): Promise<void> {
    await this.sendVerify(
      phone,
      Number(process.env.SMSIR_PHONE_CHANGE_NOTICE_TEMPLATE_ID) ||
        PHONE_CHANGE_NOTICE_TEMPLATE_ID,
      [
        { name: 'OLDPHONE', value: oldPhone },
        { name: 'NEWPHONE', value: newPhone },
        { name: 'TIME', value: formatTehranTime(at) },
      ],
    );
  }

  /** کد تغییر رمز پنل فروشگاه — قالب `SMSIR_STORE_PASSWORD_OTP_TEMPLATE_ID` (پارامتر CODE) */
  async sendStorePasswordOtp(phone: string, code: string): Promise<void> {
    await this.sendVerify(
      phone,
      Number(process.env.SMSIR_STORE_PASSWORD_OTP_TEMPLATE_ID) ||
        STORE_PASSWORD_OTP_TEMPLATE_ID,
      [{ name: OTP_PARAMETER_NAME, value: code }],
    );
  }

  async sendPurchaseOtp(
    phone: string,
    code: string,
    purchase: { store: string; price: number; wallets: string[] },
  ): Promise<void> {
    await this.sendVerify(phone, PURCHASE_TEMPLATE_ID, [
      { name: 'CODE', value: code },
      { name: 'STORE', value: purchase.store },
      { name: 'PRICE', value: toRial(purchase.price) },
      { name: 'CURRENCY', value: 'ریال' },
      { name: 'WALLET', value: purchase.wallets.join('، ') },
    ]);
  }

  /**
   * لینک پرداخت باقی مبلغ خرید فروشگاهی با کارت (UPG). قالبش باید در پنل
   * sms.ir تعریف و شناسه‌اش در `SMSIR_PAYMENT_LINK_TEMPLATE_ID` گذاشته شود
   * (پارامترها: STORE، PRICE، LINK). بدون آن، پیامک ارسال نمی‌شود و فروشنده
   * باید لینک را شفاهی بگوید — پرداخت از اپ کارمند هم در دسترس است.
   */
  sendPaymentLink(
    phone: string,
    payment: { store: string; amount: number; link: string },
  ): void {
    const templateId = Number(process.env.SMSIR_PAYMENT_LINK_TEMPLATE_ID);
    if (!templateId && process.env.SMS_MODE !== 'console') {
      this.logger.warn(
        'SMSIR_PAYMENT_LINK_TEMPLATE_ID تنظیم نشده؛ لینک پرداخت پیامک نشد',
      );
      return;
    }
    this.notify(phone, templateId || 0, [
      { name: 'STORE', value: payment.store },
      { name: 'PRICE', value: `${toRial(payment.amount)} ریال` },
      { name: 'LINK', value: payment.link },
    ]);
  }

  /** «ورود به حساب شما انجام شد» — هشدار ورود؛ خطایش ورود را خراب نمی‌کند */
  sendLoginNotice(phone: string, at: Date): void {
    this.notify(phone, LOGIN_NOTICE_TEMPLATE_ID, [
      { name: 'TIME', value: formatTehranTime(at) },
    ]);
  }

  /**
   * «خرید شما ثبت شد» — یک پیامک برای هر کیف پولِ درگیر در خرید، تا مبلغ و
   * ماندهٔ همان کیف پول در یک قالب ثابت جا شود. بعد از commit صدا زده می‌شود.
   */
  sendPaymentNotices(
    phone: string,
    store: string,
    lines: { walletName: string; amount: number; remainingAfter: number }[],
  ): void {
    for (const line of lines) {
      this.notify(phone, PAYMENT_NOTICE_TEMPLATE_ID, [
        { name: 'STORE', value: store },
        // قالب #CURRENCY# ندارد؛ واحد همراه خودِ مقدار می‌رود
        { name: 'PRICE', value: `${toRial(line.amount)} ریال` },
        { name: 'WALLET', value: line.walletName },
        { name: 'BALANCE', value: `${toRial(line.remainingAfter)} ریال` },
      ]);
    }
  }

  /** ارسال بدون انتظار: پیامکِ اطلاع‌رسانی نباید درخواست اصلی را fail کند */
  private notify(
    phone: string,
    templateId: number,
    parameters: SmsParameter[],
  ): void {
    // sendVerify خودش خطا را لاگ می‌کند
    this.sendVerify(phone, templateId, parameters).catch(() => undefined);
  }

  private async sendVerify(
    phone: string,
    templateId: number,
    parameters: SmsParameter[],
  ): Promise<void> {
    if (process.env.SMS_MODE === 'console') {
      this.logger.warn(
        `[development only] SMS ${templateId} to ${phone}: ${parameters
          .map((parameter) => `${parameter.name}=${parameter.value}`)
          .join(' ')}`,
      );
      return;
    }

    const apiKey = process.env.SMSIR_API_KEY;
    if (!apiKey || !Number.isSafeInteger(templateId) || templateId <= 0) {
      throw new ServiceUnavailableException('سرویس پیامک پیکربندی نشده است');
    }

    try {
      const response = await fetch(SMS_IR_VERIFY_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          mobile: phone,
          templateId,
          parameters,
        }),
        signal: AbortSignal.timeout(10_000),
      });

      const payload = (await response.json()) as SmsIrResponse;
      if (!response.ok || payload.status !== SMS_IR_OK_STATUS) {
        throw new Error(
          `sms.ir returned HTTP ${response.status} / status ${payload.status}: ${
            payload.message ?? 'unknown error'
          }`,
        );
      }
      this.logger.log(
        `sms.ir accepted template ${templateId}; delivery to the handset is not confirmed`,
      );
    } catch (error) {
      this.logger.error(
        'sms.ir SMS failed',
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException(
        'ارسال پیامک انجام نشد؛ دوباره تلاش کنید',
      );
    }
  }
}

/** مبالغ داخلی تومان‌اند؛ قالب‌های پیامک ریال نشان می‌دهند */
function toRial(toman: number): string {
  return (toman * 10).toLocaleString('en-US');
}

/** مثلاً `1405/07/20 ساعت 14:35` — تقویم شمسی، به وقت تهران */
function formatTehranTime(at: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
      timeZone: 'Asia/Tehran',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}/${parts.month}/${parts.day} ساعت ${parts.hour}:${parts.minute}`;
}
