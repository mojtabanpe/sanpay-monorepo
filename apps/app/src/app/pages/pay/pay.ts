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
import { PayableWallet, Receipt, StoreCheckout } from '@sanpay/models';
import { ReceiptCard } from '@sanpay/receipt';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmFieldImports } from '@sanpay/ui/field';
import { HlmInputImports } from '@sanpay/ui/input';
import { HlmInputGroupImports } from '@sanpay/ui/input-group';
import {
  CheckoutService,
  parseStoreCode,
} from '../../core/checkout/checkout.service';
import { QrScanner } from '../../core/checkout/qr-scanner';

type Step = 'scan' | 'amount' | 'done';

@Component({
  selector: 'app-pay',
  imports: [
    HlmButtonImports,
    HlmCardImports,
    HlmFieldImports,
    HlmInputImports,
    HlmInputGroupImports,
    ReceiptCard,
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
  protected readonly receipt = signal<Receipt | null>(null);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  /** وقتی دسترسی دوربین رد شود، ورود دستی کد تنها راه است */
  protected readonly cameraFailed = signal(false);
  protected readonly manualCode = signal('');

  /**
   * مبلغ تایپ‌شده برای هر کیف پول، به **ریال** — همان واحدی که در اینپوت
   * نمایش داده می‌شود. API تومان می‌گیرد، ولی اگر state تومانی باشد هر رقم
   * اول (`۵` ریال → `۰` تومان) پاک می‌شود و کاربر هیچ‌وقت نمی‌تواند شروع به
   * تایپ کند؛ پس مقدار خام ریالی نگه داشته و تومان از رویش مشتق می‌شود.
   */
  private readonly rials = signal<Record<string, number>>({});

  /** مبلغ هر کیف پول به تومان، برای API */
  private readonly amounts = computed(() =>
    Object.fromEntries(
      Object.entries(this.rials()).map(([id, rial]) => [id, Math.floor(rial / 10)]),
    ),
  );

  protected readonly total = computed(() =>
    Object.values(this.amounts()).reduce((sum, amount) => sum + amount, 0),
  );
  /** ریال کمتر از ۱۰ قابل کسر نیست؛ به‌جای گردکردنِ بی‌صدا پرداخت را می‌بندیم */
  protected readonly hasFraction = computed(() =>
    Object.values(this.rials()).some((rial) => rial % 10 !== 0),
  );
  protected readonly multiWallet = computed(
    () => (this.checkout()?.wallets.length ?? 0) > 1,
  );
  protected readonly canPay = computed(
    () => this.total() > 0 && !this.hasFraction() && !this.busy(),
  );

  /**
   * ساعتِ «زنده» روی صفحهٔ رسید. اسکرین‌شاتِ یک رسید قدیمی نه می‌تپد و نه
   * ثانیه‌شمارش جلو می‌رود، پس صندوق‌دار از روی گوشی می‌بیند که رسید تازه
   * است. زمان از ساعت خود گوشی لحظهٔ رسیدن پاسخ گرفته می‌شود، نه از
   * `createdAt` سرور، تا اختلاف ساعت دستگاه عدد منفی یا عجیب نسازد.
   */
  private readonly receivedAt = signal(0);
  private readonly now = signal(Date.now());
  protected readonly elapsedLabel = computed(() => {
    const seconds = Math.max(
      0,
      Math.floor((this.now() - this.receivedAt()) / 1000),
    );
    if (seconds < 5) return 'همین حالا';
    if (seconds < 60) return `${this.count(seconds)} ثانیه پیش`;
    return `${this.count(Math.floor(seconds / 60))} دقیقه پیش`;
  });

  private readonly faNumber = new Intl.NumberFormat('fa-IR');

  constructor() {
    effect((onCleanup) => {
      if (this.step() !== 'done') return;
      this.now.set(Date.now());
      const timer = setInterval(() => this.now.set(Date.now()), 1000);
      onCleanup(() => clearInterval(timer));
    });

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
      if (checkout.wallets.length === 0) {
        this.error.set(
          `شما اعتبار قابل استفاده‌ای در ${checkout.storeName} ندارید`,
        );
        return;
      }
      this.checkout.set(checkout);
      this.rials.set({});
      this.step.set('amount');
    } catch (caught) {
      this.error.set(messageOf(caught, 'دریافت اطلاعات فروشگاه ممکن نشد'));
    } finally {
      this.busy.set(false);
    }
  }

  // ─── گام ۲: مبلغ ──────────────────────────────────────────────────

  private rialOf(wallet: PayableWallet): number {
    return this.rials()[wallet.allocationId] ?? 0;
  }

  /** مقدار نمایشی داخل اینپوت — با اعداد فارسی و جداکنندهٔ هزارگان */
  protected amountText(wallet: PayableWallet): string {
    const rial = this.rialOf(wallet);
    return rial === 0 ? '' : this.faNumber.format(rial);
  }

  protected onAmountInput(wallet: PayableWallet, event: Event): void {
    const input = event.target as HTMLInputElement;
    // تعداد رقم‌های بعد از caret، تا بعد از فرمت‌شدن caret سر جایش بماند
    const digitsAfterCaret = countDigits(
      input.value.slice(input.selectionEnd ?? input.value.length),
    );
    const parsed = toLatinDigits(input.value).replace(/\D/g, '');
    // مبلغ هرگز از سقف کیف پول بالاتر نمی‌رود — سقف در سرور هم دوباره چک می‌شود
    const clamped = Math.min(parsed === '' ? 0 : Number(parsed), wallet.max * 10);
    this.setRial(wallet, clamped);

    const text = clamped === 0 ? '' : this.faNumber.format(clamped);
    input.value = text;
    const caret = caretBeforeDigits(text, Math.min(digitsAfterCaret, countDigits(text)));
    input.setSelectionRange(caret, caret);
  }

  protected fillMax(wallet: PayableWallet): void {
    this.setRial(wallet, wallet.max * 10);
  }

  protected clearAmounts(): void {
    this.rials.set({});
  }

  private setRial(wallet: PayableWallet, rial: number): void {
    this.rials.update((current) => ({
      ...current,
      [wallet.allocationId]: rial,
    }));
    this.error.set(null);
  }

  protected async pay(): Promise<void> {
    const checkout = this.checkout();
    if (!checkout || !this.canPay()) return;

    const lines = Object.entries(this.amounts())
      .filter(([, amount]) => amount > 0)
      .map(([allocationId, amount]) => ({ allocationId, amount }));

    this.busy.set(true);
    this.error.set(null);
    try {
      const receipt = await this.checkoutService.pay({
        storeCode: checkout.storeCode,
        lines,
      });
      this.receipt.set(receipt);
      this.receivedAt.set(Date.now());
      this.step.set('done');
      // لرزش کوتاهِ تأیید — فقط اندروید؛ iOS این API را ندارد
      navigator.vibrate?.(30);
    } catch (caught) {
      this.error.set(messageOf(caught, 'ثبت پرداخت ممکن نشد'));
    } finally {
      this.busy.set(false);
    }
  }

  // ─── گام ۳ و ناوبری ───────────────────────────────────────────────

  protected restart(): void {
    this.checkout.set(null);
    this.receipt.set(null);
    this.rials.set({});
    this.error.set(null);
    this.manualCode.set('');
    this.step.set('scan');
  }

  protected goHome(): void {
    void this.router.navigate(['/home']);
  }

  protected toman(value: number): string {
    return `${this.faNumber.format(value * 10)} ریال`;
  }

  protected count(value: number): string {
    return this.faNumber.format(value);
  }
}

/** ارقام فارسی و عربی (paste از جای دیگر) را لاتین می‌کند */
function toLatinDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
}

function countDigits(value: string): number {
  return toLatinDigits(value).replace(/\D/g, '').length;
}

/** جایگاهی در `text` که دقیقاً `digitsAfter` رقم بعد از آن باشد */
function caretBeforeDigits(text: string, digitsAfter: number): number {
  let seen = 0;
  for (let i = text.length; i > 0; i--) {
    if (seen === digitsAfter) return i;
    if (/\d/.test(toLatinDigits(text[i - 1]))) seen++;
  }
  return 0;
}

function messageOf(caught: unknown, fallback: string): string {
  const message = (caught as { error?: { message?: unknown } })?.error?.message;
  return typeof message === 'string' ? message : fallback;
}
