import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { WalletTransactionItem } from '@sanpay/models';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmSkeletonImports } from '@sanpay/ui/skeleton';
import { firstValueFrom } from 'rxjs';
import { ProfileService } from '../data-access/profile.service';
import { toman } from '../format';

const WHEN = new Intl.DateTimeFormat('fa-IR', {
  timeZone: 'Asia/Tehran',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

@Component({
  selector: 'profile-wallet-transactions',
  imports: [RouterLink, HlmButtonImports, HlmCardImports, HlmSkeletonImports],
  templateUrl: './wallet-transactions.html',
})
export class WalletTransactionsPage {
  private readonly profile = inject(ProfileService);
  protected readonly transactions = signal<WalletTransactionItem[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  protected readonly nextCursor = signal<string | null>(null);
  protected readonly toman = toman;
  protected readonly when = (iso: string) => WHEN.format(new Date(iso));
  protected readonly labels: Record<WalletTransactionItem['type'], string> = {
    TOPUP: 'شارژ کیف پول',
    REFUND: 'برگشت وجه',
    PURCHASE: 'خرید',
    ADJUSTMENT: 'کسر دستی اعتبار',
    WITHDRAWAL: 'برداشت',
  };

  constructor() {
    void this.load();
  }

  protected async load(more = false): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set(false);
    try {
      const page = await firstValueFrom(
        this.profile.walletTransactions(
          more ? (this.nextCursor() ?? undefined) : undefined,
        ),
      );
      this.transactions.update((items) =>
        more ? [...items, ...page.items] : page.items,
      );
      this.nextCursor.set(page.nextCursor);
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}
