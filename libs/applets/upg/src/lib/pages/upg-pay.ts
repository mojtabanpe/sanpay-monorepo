import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { UpgIntentView, UpgLine, UpgSource } from '@sanpay/models';
import { SanpayAmountInput } from '@sanpay/forms';
import { HlmAlertImports } from '@sanpay/ui/alert';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmInputImports } from '@sanpay/ui/input';
import { HlmInputGroupImports } from '@sanpay/ui/input-group';
import { HlmSheetImports } from '@sanpay/ui/sheet';
import { HlmSkeletonImports } from '@sanpay/ui/skeleton';
import { firstValueFrom } from 'rxjs';
import { UpgService } from '../data-access/upg.service';
import { toman } from '../format';

/**
 * صفحهٔ پرداخت UPG. پیش‌فرض «اول اعتبار» است و ورودی هر منبع قابل ویرایش
 * است؛ هر چه از مبلغ کل بماند با کارت بانکی پرداخت می‌شود.
 */
@Component({
  selector: 'upg-pay',
  imports: [
    HlmAlertImports,
    HlmButtonImports,
    HlmCardImports,
    HlmInputImports,
    HlmInputGroupImports,
    HlmSheetImports,
    HlmSkeletonImports,
    SanpayAmountInput,
  ],
  templateUrl: './upg-pay.html',
})
export class UpgPayPage {
  private readonly upg = inject(UpgService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly intentId =
    this.route.snapshot.paramMap.get('intentId') ?? '';

  protected readonly intent = signal<UpgIntentView | null>(null);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly confirmOpen = signal(false);
  /** بعد از ارسال به درگاه — صفحه تا رفتن مرورگر قفل می‌ماند */
  protected readonly redirecting = signal(false);

  /**
   * مبلغ هر منبع به **ریال**، همان واحد اینپوت. state تومانی رقم اول را
   * می‌خورد (`۵` ریال → `۰` تومان)؛ تومان از رویش مشتق می‌شود.
   */
  private readonly rials = signal<Record<string, number>>({});

  private readonly amounts = computed(() =>
    Object.fromEntries(
      Object.entries(this.rials()).map(([id, rial]) => [
        id,
        Math.floor(rial / 10),
      ]),
    ),
  );

  protected readonly creditTotal = computed(() =>
    Object.values(this.amounts()).reduce((sum, amount) => sum + amount, 0),
  );
  protected readonly cardAmount = computed(() =>
    Math.max(0, (this.intent()?.amount ?? 0) - this.creditTotal()),
  );
  protected readonly overpaid = computed(
    () => this.creditTotal() > (this.intent()?.amount ?? 0),
  );
  protected readonly hasFraction = computed(() =>
    Object.values(this.rials()).some((rial) => rial % 10 !== 0),
  );
  protected readonly cardBlocked = computed(
    () => this.cardAmount() > 0 && !this.intent()?.cardAvailable,
  );
  protected readonly canPay = computed(
    () =>
      !!this.intent() &&
      !this.overpaid() &&
      !this.hasFraction() &&
      !this.cardBlocked() &&
      !this.busy(),
  );

  protected readonly payLabel = computed(() => {
    const card = this.cardAmount();
    const credit = this.creditTotal();
    if (card === 0) return 'پرداخت از اعتبار';
    if (credit === 0) return 'پرداخت با کارت بانکی';
    return 'پرداخت ترکیبی';
  });

  protected readonly confirmLines = computed(() => {
    const intent = this.intent();
    if (!intent) return [];
    const lines = intent.sources
      .map((source) => ({
        name: source.name,
        amount: this.amounts()[source.allocationId] ?? 0,
      }))
      .filter((line) => line.amount > 0);
    if (this.cardAmount() > 0) {
      lines.push({ name: 'کارت بانکی', amount: this.cardAmount() });
    }
    return lines;
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const intent = await firstValueFrom(this.upg.view(this.intentId));
      // پرداخت انجام‌شده یا بسته‌شده — صفحهٔ نتیجه وضعیتش را توضیح می‌دهد
      if (intent.status !== 'PENDING' && intent.status !== 'AWAITING_GATEWAY') {
        await this.router.navigate(['/upg', this.intentId, 'result'], {
          replaceUrl: true,
        });
        return;
      }
      this.intent.set(intent);
      this.applyLines(intent.suggested);
    } catch (caught) {
      this.error.set(messageOf(caught, 'دریافت اطلاعات پرداخت ممکن نشد'));
    } finally {
      this.loading.set(false);
    }
  }

  private applyLines(lines: UpgLine[]): void {
    this.rials.set(
      Object.fromEntries(
        lines.map((line) => [line.allocationId, line.amount * 10]),
      ),
    );
  }

  protected rialText(source: UpgSource): string {
    const rial = this.rials()[source.allocationId] ?? 0;
    return rial === 0 ? '' : String(rial);
  }

  protected onAmount(source: UpgSource, digits: string): void {
    this.rials.update((current) => ({
      ...current,
      [source.allocationId]: Number(digits || 0),
    }));
    this.error.set(null);
  }

  /** «حداکثر» تا جایی پر می‌کند که از مبلغ کل جلو نزند */
  protected fillMax(source: UpgSource): void {
    const others =
      this.creditTotal() - (this.amounts()[source.allocationId] ?? 0);
    const room = Math.max(0, (this.intent()?.amount ?? 0) - others);
    this.onAmount(source, String(Math.min(source.max, room) * 10));
  }

  protected useSuggested(): void {
    const intent = this.intent();
    if (intent) this.applyLines(intent.suggested);
  }

  protected payAllByCard(): void {
    this.rials.set({});
  }

  protected onConfirmStateChange(state: string): void {
    if (state === 'closed' && !this.busy()) {
      this.confirmOpen.set(false);
      this.error.set(null);
    }
  }

  protected async pay(): Promise<void> {
    const intent = this.intent();
    if (!intent || !this.canPay()) return;

    const lines = Object.entries(this.amounts())
      .filter(([, amount]) => amount > 0)
      .map(([allocationId, amount]) => ({ allocationId, amount }));

    this.busy.set(true);
    this.error.set(null);
    try {
      const response = await firstValueFrom(this.upg.pay(intent.id, lines));
      if (response.kind === 'redirect') {
        this.redirecting.set(true);
        window.location.href = response.url;
        return;
      }
      this.confirmOpen.set(false);
      await this.router.navigate(['/upg', intent.id, 'result'], {
        replaceUrl: true,
      });
    } catch (caught) {
      this.error.set(messageOf(caught, 'پرداخت انجام نشد'));
    } finally {
      if (!this.redirecting()) this.busy.set(false);
    }
  }

  protected async cancel(): Promise<void> {
    const intent = this.intent();
    if (!intent) return;
    this.busy.set(true);
    try {
      await firstValueFrom(this.upg.cancel(intent.id));
    } catch {
      // انصراف ناموفق مهم نیست؛ intent خودش منقضی می‌شود
    }
    await this.router.navigateByUrl(intent.backPath);
  }

  protected readonly toman = toman;
}

function messageOf(caught: unknown, fallback: string): string {
  if (caught instanceof HttpErrorResponse) {
    const message = caught.error?.message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message) && typeof message[0] === 'string')
      return message[0];
  }
  return fallback;
}
