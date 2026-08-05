import { Component, computed, inject, signal } from '@angular/core';
import { HlmAlertImports } from '@sanpay/ui/alert';
import { HlmButtonImports } from '@sanpay/ui/button';
import { StoreAuthService } from '../../core/store-auth.service';

/**
 * کد QR صندوق — فروشنده اینجا کدش را می‌بیند، تصویرش را می‌گیرد و چاپ می‌کند
 * تا روی میز صندوق بگذارد. کارمند همین را اسکن می‌کند تا خرید کند.
 *
 * تولید تصویر سمت کلاینت است و به API نیاز ندارد: محتوای QR فقط از روی کدِ
 * فروشگاه ساخته می‌شود که از قبل در `GET /api/store/me` می‌آید.
 */
@Component({
  selector: 'store-qr',
  imports: [HlmAlertImports, HlmButtonImports],
  templateUrl: './qr.html',
})
export class QrPage {
  private readonly auth = inject(StoreAuthService);

  protected readonly store = this.auth.profile;
  protected readonly error = signal(false);
  protected readonly busy = signal(false);

  /** محتوای QR — همان قراردادی که `parseStoreCode` در اپ کارمند می‌خواند */
  protected readonly payload = computed(() => {
    const code = this.store()?.code;
    return code ? `SANPAY:S:${code}` : '';
  });

  /**
   * تصویر QR به‌صورت data-URI.
   *
   * `qrcode` با import پویا بارگذاری می‌شود تا از باندل اولیهٔ پنل بیرون بماند؛
   * صفحه‌ای که فروشنده روزی یک بار باز می‌کند نباید هزینهٔ صفحهٔ فروش باشد.
   */
  protected readonly dataUrl = signal<string | null>(null);

  constructor() {
    void this.render();
  }

  private async render(): Promise<void> {
    const payload = this.payload();
    if (!payload) return;

    this.busy.set(true);
    this.error.set(false);
    try {
      const QRCode = await import('qrcode');
      this.dataUrl.set(
        await QRCode.toDataURL(payload, {
          // سطح تصحیح خطا H: برچسبی که ماه‌ها روی میز صندوق می‌ماند خط و خش و
          // لک برمی‌دارد؛ H تا ۳۰٪ آسیب را تحمل می‌کند.
          errorCorrectionLevel: 'H',
          // بزرگ و با حاشیهٔ کافی تا بعد از چاپ هم اسکن شود
          width: 1024,
          margin: 2,
          color: { dark: '#0a1122ff', light: '#ffffffff' },
        }),
      );
    } catch {
      this.error.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  protected retry(): void {
    void this.render();
  }

  /** دانلود PNG تا فروشنده ببرد چاپ کند */
  protected download(): void {
    const url = this.dataUrl();
    const code = this.store()?.code;
    if (!url || !code) return;

    const link = document.createElement('a');
    link.href = url;
    link.download = `sanpay-qr-${code}.png`;
    link.click();
  }

  /**
   * چاپ. کل صفحه چاپ می‌شود ولی استایل چاپ در qr.html همه‌چیز جز کارتِ
   * چاپ‌شدنی را پنهان می‌کند، پس خروجی یک برگهٔ تمیز است.
   */
  protected print(): void {
    window.print();
  }
}
