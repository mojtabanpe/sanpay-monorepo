import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmSeparatorImports } from '@sanpay/ui/separator';
import { AdminAuthService } from '../core/admin-auth.service';
import { ADMIN_ROLE_LABELS } from '../core/format';

interface NavItem {
  path: string;
  label: string;
  /** مسیر SVG آیکون (۲۴×۲۴، stroke) */
  icon: string;
  superAdminOnly?: boolean;
}

/**
 * چیدمان داشبورد: نوار کناری ثابت + محتوای تمام‌عرض.
 * هیچ `max-w` روی محتوا نیست — جدول‌های مدیریتی باید کل عرض صفحه را بگیرند.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterModule, HlmButtonImports, HlmSeparatorImports],
  templateUrl: './shell.html',
})
export class Shell {
  private readonly auth = inject(AdminAuthService);
  private readonly router = inject(Router);

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
    NAV.filter((item) => !item.superAdminOnly || this.auth.isSuperAdmin()),
  );

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
    path: '/bookings',
    label: 'رزرو هتل',
    icon: 'M3 20V8l9-4 9 4v12M3 20h18M9 20v-6h6v6',
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
