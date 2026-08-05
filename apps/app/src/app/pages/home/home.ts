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
}
