import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '@sanpay/applets/auth';
import { EmployeeProfile, ProfileSummary } from '@sanpay/models';
import { HlmBadgeImports } from '@sanpay/ui/badge';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmInputImports } from '@sanpay/ui/input';
import { HlmSkeletonImports } from '@sanpay/ui/skeleton';
import { firstValueFrom } from 'rxjs';
import { ProfileService } from '../data-access/profile.service';
import { daysUntil, faNumber, jalali, toman } from '../format';

@Component({
  selector: 'profile-home',
  imports: [
    FormsModule,
    RouterLink,
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

  protected logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }

  protected readonly toman = toman;
  protected readonly count = faNumber;
  protected readonly jalali = jalali;
}

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
