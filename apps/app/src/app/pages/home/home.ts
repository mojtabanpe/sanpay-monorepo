import {
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmployeeStore, PaymentHistoryItem, Wallet } from '@sanpay/models';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmSkeletonImports } from '@sanpay/ui/skeleton';
import { firstValueFrom } from 'rxjs';
import { HomeService } from './home.service';

type WalletSection = 'stores' | 'history';

interface WalletPurchase {
  id: string;
  receiptNo: string;
  storeName: string;
  amount: number;
  createdAt: string;
}

@Component({
  selector: 'app-home',
  imports: [RouterLink, HlmCardImports, HlmSkeletonImports],
  templateUrl: './home.html',
})
export class HomePage {
  private readonly homeService = inject(HomeService);

  protected readonly wallets = signal<Wallet[]>([]);
  protected readonly stores = signal<EmployeeStore[]>([]);
  protected readonly payments = signal<PaymentHistoryItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly activeWalletIndex = signal(0);
  protected readonly activeSection = signal<WalletSection>('stores');
  protected readonly walletDetailsLoading = signal(false);
  protected readonly activeWallet = computed(
    () => this.wallets()[this.activeWalletIndex()] ?? null,
  );
  private readonly walletCarousel =
    viewChild<ElementRef<HTMLElement>>('walletCarousel');
  private storesRequestId = 0;

  private readonly purchasesByWallet = computed(() => {
    const result = new Map<string, WalletPurchase[]>();
    for (const payment of this.payments()) {
      const amounts = new Map<string, number>();
      for (const line of payment.lines) {
        amounts.set(
          line.allocationId,
          (amounts.get(line.allocationId) ?? 0) + line.amount,
        );
      }
      for (const [allocationId, amount] of amounts) {
        const current = result.get(allocationId) ?? [];
        current.push({
          id: payment.id,
          receiptNo: payment.receiptNo,
          storeName: payment.storeName,
          amount,
          createdAt: payment.createdAt,
        });
        result.set(allocationId, current);
      }
    }
    return result;
  });

  private readonly faNumber = new Intl.NumberFormat('fa-IR');
  private readonly faDate = new Intl.DateTimeFormat('fa-IR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(false);
    try {
      const result = await firstValueFrom(this.homeService.load());
      this.wallets.set(result.wallets);
      this.payments.set(result.payments);
      this.activeWalletIndex.set(0);
      this.activeSection.set('stores');
      if (result.wallets[0]) await this.loadStores(result.wallets[0].id);
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected selectSection(section: WalletSection): void {
    this.activeSection.set(section);
  }

  protected walletPurchases(walletId: string): WalletPurchase[] {
    return this.purchasesByWallet().get(walletId) ?? [];
  }

  private async loadStores(walletId: string): Promise<void> {
    const requestId = ++this.storesRequestId;
    const startedAt = Date.now();
    this.walletDetailsLoading.set(true);
    try {
      const stores = await firstValueFrom(this.homeService.stores(walletId));
      const remainingDelay = Math.max(0, 300 - (Date.now() - startedAt));
      if (remainingDelay) {
        await new Promise((resolve) => setTimeout(resolve, remainingDelay));
      }
      if (requestId === this.storesRequestId) this.stores.set(stores);
    } finally {
      const remainingDelay = Math.max(0, 300 - (Date.now() - startedAt));
      if (remainingDelay) {
        await new Promise((resolve) => setTimeout(resolve, remainingDelay));
      }
      if (requestId === this.storesRequestId) {
        this.walletDetailsLoading.set(false);
      }
    }
  }

  private activateWallet(index: number): void {
    if (index === this.activeWalletIndex()) return;
    this.activeWalletIndex.set(index);
    this.activeSection.set('stores');
    const wallet = this.wallets()[index];
    if (wallet) void this.loadStores(wallet.id);
  }

  protected moveCarousel(delta: number): void {
    const next = Math.min(
      Math.max(this.activeWalletIndex() + delta, 0),
      this.wallets().length - 1,
    );
    this.showWallet(next);
  }

  protected showWallet(index: number): void {
    const carousel = this.walletCarousel()?.nativeElement;
    if (!carousel) return;
    const card = carousel.children.item(index) as HTMLElement | null;
    if (!card) return;
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    card.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'start',
    });
    this.activateWallet(index);
  }

  protected syncCarousel(event: Event): void {
    const carousel = event.currentTarget as HTMLElement;
    const cards = Array.from(carousel.children) as HTMLElement[];
    if (!cards.length) return;
    const edge = carousel.getBoundingClientRect().right;
    let nearest = 0;
    let distance = Number.POSITIVE_INFINITY;
    cards.forEach((card, index) => {
      const current = Math.abs(card.getBoundingClientRect().right - edge);
      if (current < distance) {
        nearest = index;
        distance = current;
      }
    });
    this.activateWallet(nearest);
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
    return wallet.cap === 0
      ? 0
      : Math.round((wallet.remaining / wallet.cap) * 100);
  }

  protected categoryVar(wallet: Wallet, suffix: '' | '-fg' | '-bg'): string {
    const known = ['food', 'grocery', 'sport', 'health', 'travel', 'gift'];
    const icon = wallet.icon ?? '';
    if (!known.includes(icon)) {
      return suffix === '-bg' ? 'var(--muted)' : 'var(--ink-700)';
    }
    return `var(--cat-${icon}${suffix})`;
  }
}
