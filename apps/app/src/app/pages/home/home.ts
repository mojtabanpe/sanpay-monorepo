import { Component, computed, inject, signal } from '@angular/core';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmProgressImports } from '@sanpay/ui/progress';
import { HlmSkeletonImports } from '@sanpay/ui/skeleton';
import { Wallet } from '@sanpay/models';
import { firstValueFrom } from 'rxjs';
import { WalletService } from '@sanpay/applets/wallet';

@Component({
  selector: 'app-home',
  imports: [HlmCardImports, HlmProgressImports, HlmSkeletonImports],
  templateUrl: './home.html',
})
export class HomePage {
  private readonly walletService = inject(WalletService);

  protected readonly wallets = signal<Wallet[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal(false);

  protected readonly totalRemaining = computed(() =>
    this.wallets().reduce((sum, w) => sum + w.remaining, 0),
  );

  private readonly faNumber = new Intl.NumberFormat('fa-IR');
  private readonly faDate = new Intl.DateTimeFormat('fa-IR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  constructor() {
    this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(false);
    try {
      this.wallets.set(await firstValueFrom(this.walletService.getWallets()));
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected toman(value: number): string {
    return `${this.faNumber.format(value)} تومان`;
  }

  protected count(value: number): string {
    return this.faNumber.format(value);
  }

  protected date(iso: string): string {
    return this.faDate.format(new Date(iso));
  }

  protected percentRemaining(wallet: Wallet): number {
    return wallet.cap === 0 ? 0 : Math.round((wallet.remaining / wallet.cap) * 100);
  }

  /**
   * رنگ دستهٔ کیف پول (توکن‌های --cat-* در glass.css).
   *
   * فهرست خانه پنج-شش کیف پول است که همه با یک جعبهٔ آیکنِ خاکستریِ یکسان
   * نمایش داده می‌شدند؛ برای پیدا کردن «ورزش» باید عنوان‌ها را می‌خواندی.
   * رنگ دسته اینجا تزئین نیست، راهِ تفکیک است.
   *
   * `icon` از سرور رشتهٔ آزاد است، پس هر مقدار ناشناخته به ink برمی‌گردد
   * (نه به یک رنگ تصادفی) تا دستهٔ تازه‌ای که اضافه شود، بی‌سروصدا رنگِ
   * دستهٔ دیگری را قرض نگیرد.
   */
  protected categoryVar(wallet: Wallet, suffix: '' | '-fg' | '-bg'): string {
    const known = ['food', 'grocery', 'sport', 'health', 'travel', 'gift'];
    const icon = wallet.icon ?? '';
    if (!known.includes(icon)) {
      return suffix === '-bg' ? 'var(--muted)' : 'var(--ink-700)';
    }
    return `var(--cat-${icon}${suffix})`;
  }
}
