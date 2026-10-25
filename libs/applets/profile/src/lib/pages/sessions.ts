import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmployeeSessionView } from '@sanpay/models';
import { HlmBadgeImports } from '@sanpay/ui/badge';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmSheetImports } from '@sanpay/ui/sheet';
import { HlmSkeletonImports } from '@sanpay/ui/skeleton';
import { firstValueFrom } from 'rxjs';
import { ProfileService } from '../data-access/profile.service';

const WHEN = new Intl.DateTimeFormat('fa-IR', {
  timeZone: 'Asia/Tehran',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

@Component({
  selector: 'profile-sessions',
  imports: [
    RouterLink,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmSheetImports,
    HlmSkeletonImports,
  ],
  templateUrl: './sessions.html',
})
export class SessionsPage {
  private readonly profile = inject(ProfileService);
  protected readonly sessions = signal<EmployeeSessionView[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly selected = signal<EmployeeSessionView | 'others' | null>(
    null,
  );
  protected readonly hasOthers = computed(() =>
    this.sessions().some((session) => !session.isCurrent),
  );
  protected readonly when = (iso: string) => WHEN.format(new Date(iso));
  protected readonly confirmTitle = computed(() => {
    const selected = this.selected();
    return selected === 'others'
      ? 'خروج از همهٔ دستگاه‌های دیگر'
      : selected
        ? `خروج از ${selected.device}`
        : 'خروج از دستگاه';
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const sessions = await firstValueFrom(this.profile.sessions());
      this.sessions.set(
        sessions.sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent)),
      );
    } catch {
      this.error.set('دریافت دستگاه‌های متصل ممکن نشد. دوباره تلاش کنید.');
    } finally {
      this.loading.set(false);
    }
  }

  protected onConfirmState(state: string): void {
    if (state === 'closed' && !this.busy()) this.selected.set(null);
  }

  protected async revoke(): Promise<void> {
    const selected = this.selected();
    if (!selected || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await firstValueFrom(
        selected === 'others'
          ? this.profile.revokeOtherSessions()
          : this.profile.revokeSession(selected.id),
      );
      this.sessions.update((sessions) =>
        sessions.filter((session) =>
          selected === 'others'
            ? session.isCurrent
            : session.id !== selected.id,
        ),
      );
      this.selected.set(null);
      this.notice.set(
        selected === 'others'
          ? 'همهٔ دستگاه‌های دیگر خارج شدند.'
          : 'دستگاه از حساب خارج شد.',
      );
    } catch {
      this.error.set('خروج از دستگاه انجام نشد. دوباره تلاش کنید.');
    } finally {
      this.busy.set(false);
    }
  }
}
