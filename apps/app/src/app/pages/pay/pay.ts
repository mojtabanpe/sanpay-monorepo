import {
  Component,
  ElementRef,
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
import { CheckoutService, parseStoreCode } from '../../core/checkout/checkout.service';
import { QrScanner } from '../../core/checkout/qr-scanner';

type Step = 'scan' | 'amount' | 'done';

@Component({
  selector: 'app-pay',
  imports: [HlmButtonImports, HlmCardImports, ReceiptCard],
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

  /** مبلغ انتخاب‌شده از هر کیف پول (تومان) */
  private readonly amounts = signal<Record<string, number>>({});

  protected readonly total = computed(() =>
    Object.values(this.amounts()).reduce((sum, amount) => sum + amount, 0),
  );
  protected readonly multiWallet = computed(
    () => (this.checkout()?.wallets.length ?? 0) > 1,
  );
  protected readonly canPay = computed(() => this.total() > 0 && !this.busy());

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
      this.amounts.set({});
      this.step.set('amount');
    } catch (caught) {
      this.error.set(messageOf(caught, 'دریافت اطلاعات فروشگاه ممکن نشد'));
    } finally {
      this.busy.set(false);
    }
  }

  // ─── گام ۲: مبلغ ──────────────────────────────────────────────────

  protected amountOf(wallet: PayableWallet): number {
    return this.amounts()[wallet.allocationId] ?? 0;
  }

  /** مقدار نمایشی داخل اینپوت — با اعداد فارسی و جداکنندهٔ هزارگان */
  protected amountText(wallet: PayableWallet): string {
    const amount = this.amountOf(wallet);
    return amount === 0 ? '' : this.faNumber.format(amount);
  }

  protected onAmountInput(wallet: PayableWallet, event: Event): void {
    const input = event.target as HTMLInputElement;
    const parsed = toLatinDigits(input.value).replace(/\D/g, '');
    // مبلغ هرگز از سقف کیف پول بالاتر نمی‌رود — سقف در سرور هم دوباره چک می‌شود
    const amount = Math.min(parsed === '' ? 0 : Number(parsed), wallet.max);
    this.setAmount(wallet, amount);
    input.value = amount === 0 ? '' : this.faNumber.format(amount);
  }

  protected fillMax(wallet: PayableWallet): void {
    this.setAmount(wallet, wallet.max);
  }

  protected clearAmounts(): void {
    this.amounts.set({});
  }

  private setAmount(wallet: PayableWallet, amount: number): void {
    this.amounts.update((current) => ({
      ...current,
      [wallet.allocationId]: amount,
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
      this.step.set('done');
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
    this.amounts.set({});
    this.error.set(null);
    this.manualCode.set('');
    this.step.set('scan');
  }

  protected goHome(): void {
    void this.router.navigate(['/home']);
  }

  protected toman(value: number): string {
    return `${this.faNumber.format(value)} تومان`;
  }

  protected count(value: number): string {
    return this.faNumber.format(value);
  }
}

function toLatinDigits(value: string): string {
  return value.replace(/[۰-۹]/g, (digit) =>
    String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)),
  );
}

function messageOf(caught: unknown, fallback: string): string {
  const message = (caught as { error?: { message?: unknown } })?.error?.message;
  return typeof message === 'string' ? message : fallback;
}
