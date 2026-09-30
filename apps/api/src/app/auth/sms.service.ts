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

  async sendPurchaseOtp(
    phone: string,
    code: string,
    purchase: { store: string; price: number; wallets: string[] },
  ): Promise<void> {
    await this.sendVerify(phone, PURCHASE_TEMPLATE_ID, [
      { name: 'CODE', value: code },
      { name: 'STORE', value: purchase.store },
      { name: 'PRICE', value: purchase.price.toLocaleString('en-US') },
      { name: 'CURRENCY', value: 'تومان' },
      { name: 'WALLET', value: purchase.wallets.join('، ') },
    ]);
  }

  private async sendVerify(
    phone: string,
    templateId: number,
    parameters: SmsParameter[],
  ): Promise<void> {
    if (process.env.SMS_MODE === 'console') {
      this.logger.warn(
        `[development only] OTP for ${phone}: ${parameters[0].value}`,
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
        'sms.ir accepted OTP request; delivery to the handset is not confirmed',
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
