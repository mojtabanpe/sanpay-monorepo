import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { StoreCheckout } from '@sanpay/models';
import { HlmAlertImports } from '@sanpay/ui/alert';
import { HlmButtonImports } from '@sanpay/ui/button';
import { SanpayAmountInput } from '@sanpay/forms';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmFieldImports } from '@sanpay/ui/field';
import { HlmInputImports } from '@sanpay/ui/input';
import { HlmInputGroupImports } from '@sanpay/ui/input-group';
import {
  CheckoutService,
  parseStoreCode,
} from '../../core/checkout/checkout.service';
import { QrScanner } from '../../core/checkout/qr-scanner';

type Step = 'scan' | 'amount';

@Component({
  selector: 'app-pay',
  imports: [
    HlmAlertImports,
    HlmButtonImports,
    HlmCardImports,
    HlmFieldImports,
    HlmInputImports,
    HlmInputGroupImports,
    SanpayAmountInput,
  ],
  templateUrl: './pay.html',
})
export class PayPage implements OnDestroy {
  private readonly checkoutService = inject(CheckoutService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly videoRef = viewChild<ElementRef<HTMLVideoElement>>('video');
  private scanner: QrScanner | null = null;

  protected readonly step = signal<Step>('scan');
  protected readonly checkout = signal<StoreCheckout | null>(null);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  /** وقتی دسترسی دوربین رد شود، ورود دستی کد تنها راه است */
  protected readonly cameraFailed = signal(false);
  protected readonly manualCode = signal('');

  /**
   * مبلغ کل به **ریال** (ارقام لاتین بی‌جداکننده — مدل `sanpayAmount`)، همان
   * واحدی که در اینپوت دیده می‌شود. API تومان می‌گیرد.
   */
  protected readonly rial = signal('');
  private readonly amount = computed(() => Math.floor(Number(this.rial() || 0) / 10));
  /** ریال کمتر از ۱۰ قابل کسر نیست؛ به‌جای گردکردنِ بی‌صدا ادامه را می‌بندیم */
  protected readonly hasFraction = computed(() => Number(this.rial() || 0) % 10 !== 0);
  /** خرید فروشگاهی فقط تا سقف اعتبار؛ مازاد را مستقیم با کارت در فروشگاه بدهید */
  protected readonly overLimit = computed(
    () =>
      this.amount() > 0 && this.amount() > (this.checkout()?.totalAvailable ?? 0),
  );
  protected readonly canContinue = computed(
    () =>
      this.amount() > 0 &&
      !this.hasFraction() &&
      !this.overLimit() &&
      !this.busy(),
  );

  private readonly faNumber = new Intl.NumberFormat('fa-IR');

  constructor() {
    // ورود از فهرست فروشگاه‌ها (`/qr?store=CODE`) — اسکن لازم نیست
    const preselected = parseStoreCode(
      this.route.snapshot.queryParamMap.get('store') ?? '',
    );
    if (preselected) {
      void this.loadStore(preselected);
    }

    // دوربین فقط در گام اسکن روشن است
    effect(() => {
      const video = this.videoRef()?.nativeElement;
      if (this.step() === 'scan' && video && !this.scanner) {
        void this.startCamera(video);
      } else if (this.step() !== 'scan') {
        this.stopCamera();
      }
    });
  }

  ngOnDestroy(): void {
    this.stopCamera();
  }

  @HostListener('document:visibilitychange')
  protected onVisibilityChange(): void {
    if (document.hidden) {
      this.stopCamera();
      return;
    }
    const video = this.videoRef()?.nativeElement;
    if (this.step() === 'scan' && video && !this.scanner) {
      void this.startCamera(video);
    }
  }

  // ─── گام ۱: اسکن ──────────────────────────────────────────────────

  private async startCamera(video: HTMLVideoElement): Promise<void> {
    const scanner = new QrScanner(video, (text) => {
      const code = parseStoreCode(text);
      if (code) {
        scanner.stop();
        void this.loadStore(code);
      }
    });
    this.scanner = scanner;
    try {
      await scanner.start();
      this.cameraFailed.set(false);
    } catch {
      this.cameraFailed.set(true);
      this.scanner = null;
    }
  }

  private stopCamera(): void {
    this.scanner?.stop();
    this.scanner = null;
  }

  protected submitManualCode(): void {
    const code = parseStoreCode(this.manualCode());
    if (!code) {
      this.error.set('کد فروشگاه نامعتبر است');
      return;
    }
    void this.loadStore(code);
  }

  protected onManualInput(event: Event): void {
    this.manualCode.set((event.target as HTMLInputElement).value);
    this.error.set(null);
  }

  private async loadStore(code: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const checkout = await this.checkoutService.getCheckout(code);
      this.checkout.set(checkout);
      this.rial.set('');
      this.step.set('amount');
    } catch (caught) {
      this.error.set(messageOf(caught, 'دریافت اطلاعات فروشگاه ممکن نشد'));
    } finally {
      this.busy.set(false);
    }
  }

  // ─── گام ۲: مبلغ کل → UPG ─────────────────────────────────────────

  protected fillMax(): void {
    const available = this.checkout()?.totalAvailable ?? 0;
    if (this.busy() || available <= 0) return;
    this.rial.set(String(available * 10));
    this.error.set(null);
  }

  protected async continueToPayment(): Promise<void> {
    const checkout = this.checkout();
    if (!checkout || !this.canContinue()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const { intentId } = await this.checkoutService.start({
        storeCode: checkout.storeCode,
        amount: this.amount(),
      });
      // پرداخت در UPG — مسیر `/upg/:intentId` (اپلت upg، lazy)
      await this.router.navigate(['/upg', intentId]);
    } catch (caught) {
      this.error.set(messageOf(caught, 'شروع پرداخت ممکن نشد'));
    } finally {
      this.busy.set(false);
    }
  }

  protected restart(): void {
    this.checkout.set(null);
    this.rial.set('');
    this.error.set(null);
    this.manualCode.set('');
    this.step.set('scan');
  }

  protected toman(value: number): string {
    return `${this.faNumber.format(value * 10)} ریال`;
  }

}

function messageOf(caught: unknown, fallback: string): string {
  const message = (caught as { error?: { message?: unknown } })?.error?.message;
  return typeof message === 'string' ? message : fallback;
}
