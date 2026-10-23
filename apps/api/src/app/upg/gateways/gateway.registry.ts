import { Injectable, Logger } from '@nestjs/common';
import { MockGateway } from './mock.gateway';
import { PaymentGateway } from './payment-gateway';
import { TomanIpgGateway } from './toman/toman-ipg.gateway';

type Strategy = 'priority' | 'weighted';

/**
 * فهرست درگاه‌ها و انتخاب درگاه برای پرداخت تازه.
 *
 * پیکربندی (env):
 *   UPG_GATEWAYS="mock"            ترتیب = اولویت؛ مثلاً "toman,jibit"
 *   UPG_STRATEGY="priority"        یا "weighted"
 *   UPG_WEIGHTS="toman:70,jibit:30"
 *   TOMAN_IPG_MODE="live"          هر چیز دیگری = شبیه‌ساز تومان
 *
 * «فعال» فقط یعنی «برای پرداخت تازه انتخاب می‌شود». هر درگاه شناخته‌شده‌ای
 * — حتی غیرفعال — در `get()` پیدا می‌شود، چون verify/refund پرداخت‌های قدیمی
 * همیشه از همان درگاهی انجام می‌شود که پول را گرفته.
 */
@Injectable()
export class GatewayRegistry {
  private readonly logger = new Logger(GatewayRegistry.name);
  private readonly known = new Map<string, PaymentGateway>();
  private readonly configured: string[];
  private readonly rejected: { key: string; reason: string }[] = [];
  private readonly enabled: string[];
  private readonly strategy: Strategy;
  private readonly weights: Map<string, number>;

  readonly toman = new TomanIpgGateway();

  constructor() {
    for (const gateway of [new MockGateway(), this.toman]) {
      this.known.set(gateway.key, gateway);
    }

    const production = process.env.NODE_ENV === 'production';
    this.configured = (process.env.UPG_GATEWAYS ?? (production ? '' : 'mock'))
      .split(',')
      .map((key) => key.trim().toLowerCase())
      .filter(Boolean);
    this.enabled = this.configured.filter((key) => {
      const gateway = this.known.get(key);
      if (!gateway) {
        this.reject(key, 'درگاه ناشناخته در UPG_GATEWAYS');
        return false;
      }
      // درگاه آزمایشی و شبیه‌ساز تومان هر پرداختی را «موفق» می‌پذیرند؛ در
      // production یعنی پول مجانی
      if (
        gateway.simulated &&
        production &&
        process.env.UPG_ALLOW_MOCK !== 'true'
      ) {
        this.reject(key, 'درگاه آزمایشی در production غیرفعال شد');
        return false;
      }
      return true;
    });
    this.strategy =
      process.env.UPG_STRATEGY === 'weighted' ? 'weighted' : 'priority';
    this.weights = new Map(
      (process.env.UPG_WEIGHTS || '')
        .split(',')
        .map((pair) => pair.split(':').map((part) => part.trim()))
        .filter(([key, weight]) => key && Number(weight) > 0)
        .map(([key, weight]) => [key.toLowerCase(), Number(weight)]),
    );

    this.logger.log(
      `UPG gateways: ${this.enabled.join(', ') || '(none)'} — ${this.strategy}` +
        (this.enabled.includes(this.toman.key)
          ? ` (toman: ${this.toman.live ? 'live' : 'mock'})`
          : ''),
    );
  }

  /** پیکربندی خوانده‌شده از env — برای نمایش فقط-خواندنی در داشبورد */
  config() {
    return {
      configured: [...this.configured],
      rejected: [...this.rejected],
      enabled: [...this.enabled],
      strategy: this.strategy,
      weights: new Map(this.weights),
    };
  }

  /** درگاه یک پرداخت موجود — فعال بودن شرط نیست */
  get(key: string): PaymentGateway | undefined {
    return this.known.get(key);
  }

  get available(): boolean {
    return this.enabled.length > 0;
  }

  /** برای پرداخت تازه فعال است؟ (صفحه‌های بانک آزمایشی فقط در این حالت سرو می‌شوند) */
  isEnabled(key: string): boolean {
    return this.enabled.includes(key);
  }

  /** همهٔ درگاه‌های شناخته‌شده — برای cron استعلام و بازگشت پول */
  all(): PaymentGateway[] {
    return [...this.known.values()];
  }

  /**
   * درگاه‌ها به ترتیبی که باید امتحان شوند. اولی انتخاب اصلی است و بقیه
   * failover اگر ساخت پرداخت در اولی شکست خورد.
   */
  candidates(): PaymentGateway[] {
    const keys = [...this.enabled];
    if (this.strategy === 'weighted' && keys.length > 1) {
      const first = this.weightedPick(keys);
      keys.splice(keys.indexOf(first), 1);
      keys.unshift(first);
    }
    return keys.map((key) => this.known.get(key) as PaymentGateway);
  }

  private reject(key: string, reason: string): void {
    this.logger.error(`${reason}: ${key}`);
    this.rejected.push({ key, reason });
  }

  private weightedPick(keys: string[]): string {
    const weighted = keys.map((key) => ({
      key,
      weight: this.weights.get(key) ?? 0,
    }));
    const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
    if (total <= 0) return keys[0];
    let roll = Math.random() * total;
    for (const entry of weighted) {
      roll -= entry.weight;
      if (roll < 0) return entry.key;
    }
    return keys[0];
  }
}
