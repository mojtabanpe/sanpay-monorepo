import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

interface IranPayamakResponse {
  status?: string;
  message?: string;
  messages?: string | string[];
  data?: { status?: string } | number;
}

const IRAN_PAYAMAK_PATTERN_SMS_URL =
  'https://api.iranpayamak.com/ws/v1/sms/pattern';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  async sendOtp(phone: string, code: string): Promise<void> {
    if (process.env.SMS_MODE === 'console') {
      this.logger.warn(`[development only] OTP for ${phone}: ${code}`);
      return;
    }

    const apiKey = process.env.FARAZ_SMS_API_KEY;
    const lineNumber = process.env.FARAZ_SMS_LINE_NUMBER;
    const patternCode = process.env.FARAZ_SMS_OTP_PATTERN_CODE;
    if (!apiKey || !lineNumber || !patternCode) {
      throw new ServiceUnavailableException('سرویس پیامک پیکربندی نشده است');
    }

    try {
      const response = await fetch(IRAN_PAYAMAK_PATTERN_SMS_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Api-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: patternCode,
          attributes: { code },
          recipient: phone,
          line_number: lineNumber,
          number_format: 'english',
        }),
        signal: AbortSignal.timeout(10_000),
      });

      const payload = (await response.json()) as IranPayamakResponse;
      if (!response.ok || payload.status !== 'success') {
        const providerMessage = Array.isArray(payload.messages)
          ? payload.messages.join(', ')
          : payload.messages || payload.message || payload.status;
        throw new Error(
          `IranPayamak returned ${response.status}: ${providerMessage ?? 'unknown error'}`,
        );
      }
    } catch (error) {
      this.logger.error(
        'IranPayamak SMS failed',
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException(
        'ارسال پیامک انجام نشد؛ دوباره تلاش کنید',
      );
    }
  }
}
