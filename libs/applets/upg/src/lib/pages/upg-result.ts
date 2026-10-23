import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { UpgIntentView } from '@sanpay/models';
import { ReceiptCard } from '@sanpay/receipt';
import { HlmAlertImports } from '@sanpay/ui/alert';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmSkeletonImports } from '@sanpay/ui/skeleton';
import { firstValueFrom } from 'rxjs';
import { UpgService } from '../data-access/upg.service';
import { faNumber, toman } from '../format';

/** وضعیت‌هایی که هنوز ممکن است عوض شوند — صفحه تا روشن‌شدنشان دوباره می‌پرسد */
const SETTLING = new Set(['PROCESSING', 'AWAITING_GATEWAY']);
const POLL_MS = 2000;
const POLL_LIMIT = 30;

/**
 * نتیجهٔ پرداخت. درگاه بانکی کاربر را به اینجا برمی‌گرداند؛ پرداخت فقط از
 * اعتبار هم مستقیم به اینجا می‌آید.
 */
@Component({
  selector: 'upg-result',
  imports: [
    HlmAlertImports,
    HlmButtonImports,
    HlmCardImports,
    HlmSkeletonImports,
    ReceiptCard,
  ],
  templateUrl: './upg-result.html',
})
export class UpgResultPage {
  private readonly upg = inject(UpgService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly intentId =
    this.route.snapshot.paramMap.get('intentId') ?? '';

  protected readonly intent = signal<UpgIntentView | null>(null);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  /** چند بار پرسیده‌ایم و هنوز در جریان است — بعد از سقف، کاربر خودش تازه می‌کند */
  private polls = 0;
  protected readonly stillSettling = signal(false);
  private timer: ReturnType<typeof setTimeout> | null = null;

  protected readonly receipt = computed(() => {
    const result = this.intent()?.result;
    return result?.kind === 'store-receipt' ? result.receipt : null;
  });
  protected readonly link = computed(() => {
    const result = this.intent()?.result;
    return result?.kind === 'link' ? result : null;
  });
  protected readonly paidByCard = computed(
    () => this.intent()?.gateway?.status === 'VERIFIED',
  );

  /**
   * رسید «زنده» برای صندوق‌دار — همان رفتار صفحهٔ پرداخت فروشگاه: نقطهٔ
   * تپنده و ثانیه‌شمار از ساعت خود گوشی، تا اسکرین‌شات رسید قبلی با رسید
   * تازه اشتباه نشود.
   */
  private readonly receivedAt = signal(0);
  private readonly now = signal(Date.now());
  protected readonly elapsedLabel = computed(() => {
    const seconds = Math.max(
      0,
      Math.floor((this.now() - this.receivedAt()) / 1000),
    );
    if (seconds < 5) return 'همین حالا';
    if (seconds < 60) return `${faNumber(seconds)} ثانیه پیش`;
    return `${faNumber(Math.floor(seconds / 60))} دقیقه پیش`;
  });

  constructor() {
    void this.load();

    effect((onCleanup) => {
      if (!this.receipt()) return;
      this.now.set(Date.now());
      const tick = setInterval(() => this.now.set(Date.now()), 1000);
      onCleanup(() => clearInterval(tick));
    });

    inject(DestroyRef).onDestroy(() => {
      if (this.timer) clearTimeout(this.timer);
    });
  }

  protected async load(): Promise<void> {
    this.failed.set(false);
    try {
      const intent = await firstValueFrom(this.upg.view(this.intentId));
      if (intent.status === 'COMPLETED' && !this.receivedAt()) {
        this.receivedAt.set(Date.now());
        navigator.vibrate?.(30);
      }
      this.intent.set(intent);
      this.schedule(intent);
    } catch {
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  private schedule(intent: UpgIntentView): void {
    const settling = SETTLING.has(intent.status);
    this.stillSettling.set(settling && this.polls >= POLL_LIMIT);
    if (!settling || this.polls >= POLL_LIMIT) return;
    this.polls++;
    this.timer = setTimeout(() => void this.load(), POLL_MS);
  }

  protected refresh(): void {
    this.polls = 0;
    this.loading.set(true);
    void this.load();
  }

  protected retry(): void {
    void this.router.navigate(['/upg', this.intentId], { replaceUrl: true });
  }

  protected go(path: string): void {
    void this.router.navigateByUrl(path);
  }

  protected readonly toman = toman;
}
