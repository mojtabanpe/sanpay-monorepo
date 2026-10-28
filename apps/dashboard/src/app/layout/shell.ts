import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { HlmBadgeImports } from '@sanpay/ui/badge';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmSeparatorImports } from '@sanpay/ui/separator';
import { AdminAuthService } from '../core/admin-auth.service';
import { ADMIN_ROLE_LABELS, fa } from '../core/format';
import { UpgQueueCount } from '../core/upg-queue-count';
import { AdminPermission } from '@sanpay/models';
import { filter } from 'rxjs';

interface NavItem {
  path: string;
  label: string;
  /** مسیر SVG آیکون (۲۴×۲۴، stroke) */
  icon: string;
  superAdminOnly?: boolean;
  /** شمارندهٔ کارهای مانده کنار برچسب */
  counter?: 'upg-review';
}

/**
 * چیدمان داشبورد: نوار کناری ثابت + محتوای تمام‌عرض.
 * هیچ `max-w` روی محتوا نیست — جدول‌های مدیریتی باید کل عرض صفحه را بگیرند.
 */
@Component({
  selector: 'app-shell',
  imports: [
    RouterModule,
    HlmBadgeImports,
    HlmButtonImports,
    HlmSeparatorImports,
  ],
  templateUrl: './shell.html',
})
export class Shell {
  private readonly auth = inject(AdminAuthService);
  private readonly router = inject(Router);
  private readonly upgQueue = inject(UpgQueueCount);
  protected readonly fa = fa;

  protected readonly profile = this.auth.profile;
  protected readonly roleLabel = computed(
    () => ADMIN_ROLE_LABELS[this.profile()?.role ?? ''] ?? '',
  );
  protected readonly initials = computed(() =>
    (this.profile()?.name ?? '؟').trim().slice(0, 2),
  );

  /** روی موبایل نوار کناری کشویی است */
  protected readonly menuOpen = signal(false);

  protected readonly items = computed(() =>
    NAV.filter((item) =>
      item.superAdminOnly ? this.auth.isSuperAdmin() :
      item.path === '/settings' || this.auth.hasPermission(`${item.path.slice(1)}:read` as AdminPermission),
    ),
  );

  constructor() {
    // صف با تصمیم هر مدیری کوتاه می‌شود؛ با هر جابه‌جایی صفحه تازه می‌شود
    void this.upgQueue.refresh();
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => void this.upgQueue.refresh());
  }

  protected counter(item: NavItem): number {
    return item.counter === 'upg-review' ? this.upgQueue.total() : 0;
  }

  protected logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}

const NAV: NavItem[] = [
  {
    path: '/overview',
    label: 'نمای کلی',
    icon: 'M3 12l9-9 9 9M5 10v10h14V10',
  },
  {
    path: '/companies',
    label: 'شرکت‌ها',
    icon: 'M3 21h18M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M9 7h2M9 11h2M9 15h2M15 9h4v12',
  },
  {
    path: '/employees',
    label: 'کارمندان',
    icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM22 21v-2a4 4 0 0 0-3-3.87',
  },
  {
    path: '/wallets',
    label: 'کیف‌پول‌ها',
    icon: 'M3 7h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm0 0a2 2 0 0 1 2-2h11M16 13h2',
  },
  {
    path: '/stores',
    label: 'فروشگاه‌ها',
    icon: 'M4 9h16l-1 11H5L4 9Zm4 0V6a4 4 0 1 1 8 0v3',
  },
  {
    path: '/payments',
    label: 'پرداخت‌ها',
    icon: 'M3 10h18M6 6h12a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3Zm10 8h2',
  },
  {
    path: '/gateway-payments',
    label: 'پرداخت‌های درگاه',
    icon: 'M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7Zm0 3h20M6 15h4',
  },
  {
    path: '/upg-review',
    label: 'بررسی دستی درگاه',
    icon: 'M12 3 2 20h20L12 3Zm0 6v5m0 3h.01',
    counter: 'upg-review',
  },
  {
    path: '/gateways',
    label: 'درگاه‌ها',
    icon: 'M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm4-7h.01M8 17h.01',
  },
  {
    path: '/settlements',
    label: 'تسویه‌ها',
    icon: 'M3 6h18M6 10h12M5 14h4m4 0h6M4 3h16a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z',
  },
  {
    path: '/bookings',
    label: 'رزرو هتل',
    icon: 'M3 20V8l9-4 9 4v12M3 20h18M9 20v-6h6v6',
  },
  {
    path: '/flight-bookings',
    label: 'رزرو پرواز',
    icon: 'M22 2 9 15M15 2l7 0 0 7M13 6 4 3l-2 2 7 5M18 11l3 7-2 2-5-9',
  },
  {
    path: '/tourism-split',
    label: 'تفکیک پرداخت گردشگری',
    icon: 'M12 3v18M5 8h14M7 8l-3 7a3 3 0 0 0 6 0L7 8Zm10 0-3 7a3 3 0 0 0 6 0l-3-7Z',
  },
  {
    path: '/admins',
    label: 'کاربران داشبورد',
    icon: 'M12 3l8 4v5c0 5-3.4 8.3-8 9-4.6-.7-8-4-8-9V7l8-4Zm0 7v4m0 3h.01',
    superAdminOnly: true,
  },
  {
    path: '/settings',
    label: 'تنظیمات',
    icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2-1.2L14.5 2h-4l-.4 2.6c-.7.3-1.4.7-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1c.6.5 1.3.9 2 1.2l.4 2.6h4l.4-2.6c.7-.3 1.4-.7 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z',
  },
];
