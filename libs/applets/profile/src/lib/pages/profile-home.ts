import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '@sanpay/applets/auth';
import { EmployeeProfile, ProfileSummary } from '@sanpay/models';
import { HlmAlertImports } from '@sanpay/ui/alert';
import { HlmBadgeImports } from '@sanpay/ui/badge';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmInputImports } from '@sanpay/ui/input';
import { HlmSkeletonImports } from '@sanpay/ui/skeleton';
import { Observable, firstValueFrom } from 'rxjs';
import { ProfileService } from '../data-access/profile.service';
import { CardRefundCard } from '../ui/card-refund';
import { daysUntil, faNumber, jalali, toman } from '../format';

@Component({
  selector: 'profile-home',
  imports: [
    CardRefundCard,
    FormsModule,
    RouterLink,
    HlmAlertImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmInputImports,
    HlmSkeletonImports,
  ],
  templateUrl: './profile-home.html',
})
export class ProfileHomePage {
  private readonly profileService = inject(ProfileService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** پروفایل ذخیره‌شدهٔ لاگین بلافاصله نمایش داده می‌شود؛ بعد از سرور تازه می‌شود */
  protected readonly profile = signal<EmployeeProfile | null>(
    this.auth.profile(),
  );
  protected readonly summary = signal<ProfileSummary | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal(false);

  protected readonly savingAvatar = signal(false);
  protected readonly avatarError = signal<string | null>(null);

  /** ویرایش شمارهٔ موبایل — درجا، بدون صفحهٔ جدا */
  protected readonly editingPhone = signal(false);
  protected readonly phoneDraft = signal('');
  protected readonly phoneError = signal<string | null>(null);
  protected readonly savingPhone = signal(false);

  protected readonly fullName = computed(() => {
    const profile = this.profile();
    return profile ? `${profile.firstName} ${profile.lastName}` : '';
  });

  protected readonly initials = computed(() => {
    const profile = this.profile();
    if (!profile) return '';
    return `${profile.firstName.charAt(0)}${profile.lastName.charAt(0)}`;
  });

  protected readonly rankLabel = computed(() => {
    const rank = this.profile()?.organizationalRank;
    return rank ? ORGANIZATIONAL_RANK_LABELS[rank] : '';
  });

  /** روزهای مانده تا نزدیک‌ترین انقضا — منفی/تهی یعنی چیزی برای نمایش نیست */
  protected readonly expiryDays = computed(() => {
    const iso = this.summary()?.nextExpiry;
    return iso ? daysUntil(iso) : null;
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(false);
    try {
      const [profile, summary] = await Promise.all([
        this.auth.refreshProfile(),
        firstValueFrom(this.profileService.summary()),
      ]);
      this.profile.set(profile);
      this.summary.set(summary);
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected startEditPhone(): void {
    this.phoneDraft.set(this.profile()?.phone ?? '');
    this.phoneError.set(null);
    this.editingPhone.set(true);
  }

  protected cancelEditPhone(): void {
    this.editingPhone.set(false);
    this.phoneError.set(null);
  }

  protected async savePhone(): Promise<void> {
    const phone = toEnglishDigits(this.phoneDraft().trim());
    if (phone && !/^09\d{9}$/.test(phone)) {
      this.phoneError.set('شمارهٔ موبایل باید ۱۱ رقم و با ۰۹ شروع شود');
      return;
    }

    this.savingPhone.set(true);
    this.phoneError.set(null);
    try {
      const updated = await firstValueFrom(
        this.profileService.updatePhone(phone),
      );
      this.profile.set(updated);
      this.auth.setProfile(updated);
      this.editingPhone.set(false);
    } catch {
      this.phoneError.set('ثبت شماره ناموفق بود');
    } finally {
      this.savingPhone.set(false);
    }
  }

  protected async onAvatarPicked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // تا انتخاب دوبارهٔ همان فایل هم رویداد بدهد
    input.value = '';
    if (!file) return;
    const invalid = avatarFileError(file);
    if (invalid) {
      this.avatarError.set(invalid);
      return;
    }
    await this.saveAvatar(() => this.profileService.uploadAvatar(file));
  }

  protected removeAvatar(): Promise<void> {
    return this.saveAvatar(() => this.profileService.removeAvatar());
  }

  private async saveAvatar(
    request: () => Observable<{ avatarUrl: string | null }>,
  ): Promise<void> {
    const profile = this.profile();
    if (!profile || this.savingAvatar()) return;
    this.savingAvatar.set(true);
    this.avatarError.set(null);
    try {
      const { avatarUrl } = await firstValueFrom(request());
      const updated = { ...profile, avatarUrl };
      this.profile.set(updated);
      this.auth.setProfile(updated);
    } catch (caught) {
      this.avatarError.set(avatarServerError(caught));
    } finally {
      this.savingAvatar.set(false);
    }
  }

  protected readonly logoutBusy = signal(false);
  protected readonly logoutError = signal(false);

  protected async logout(): Promise<void> {
    if (this.logoutBusy()) return;
    this.logoutBusy.set(true);
    this.logoutError.set(false);
    if (await this.auth.logout()) await this.router.navigate(['/login']);
    else this.logoutError.set(true);
    this.logoutBusy.set(false);
  }

  protected readonly toman = toman;
  protected readonly count = faNumber;
  protected readonly jalali = jalali;
}

/** همان محدودیت‌های سرور، تا کاربر برای فایل ۱۰ مگابایتی منتظر آپلود نماند */
function avatarFileError(file: File): string | null {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return 'فقط عکس JPEG، PNG یا WebP پذیرفته می‌شود';
  }
  if (file.size > 2 * 1024 * 1024) return 'حجم عکس باید حداکثر ۲ مگابایت باشد';
  return null;
}

function avatarServerError(caught: unknown): string {
  const error = caught as { status?: number; error?: { message?: unknown } };
  if (error?.status === 413) return 'حجم عکس باید حداکثر ۲ مگابایت باشد';
  const message = error?.error?.message;
  return typeof message === 'string' && error?.status === 400
    ? message
    : 'ذخیرهٔ عکس ناموفق بود';
}

const ORGANIZATIONAL_RANK_LABELS: Record<string, string> = {
  MANAGER: 'مدیر',
  DEPUTY: 'معاون',
  HEAD: 'رییس',
  EMPLOYEE: 'کارمند',
};

/** ورودی فارسی/عربی کاربر را به رقم لاتین تبدیل می‌کند تا اعتبارسنجی درست کار کند */
function toEnglishDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (digit) =>
    String(
      '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit) >= 0
        ? '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)
        : '٠١٢٣٤٥٦٧٨٩'.indexOf(digit),
    ),
  );
}
