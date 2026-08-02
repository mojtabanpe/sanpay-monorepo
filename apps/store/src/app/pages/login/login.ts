import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmInputImports } from '@sanpay/ui/input';
import { HlmLabelImports } from '@sanpay/ui/label';
import { StoreAuthService } from '../../core/store-auth.service';

@Component({
  selector: 'store-login',
  imports: [HlmButtonImports, HlmCardImports, HlmInputImports, HlmLabelImports],
  templateUrl: './login.html',
})
export class LoginPage {
  private readonly auth = inject(StoreAuthService);
  private readonly router = inject(Router);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async submit(
    usernameEl: HTMLInputElement,
    passwordEl: HTMLInputElement,
  ): Promise<void> {
    const username = usernameEl.value.trim().toLowerCase();
    const password = passwordEl.value;
    if (!username || !password || this.loading()) return;

    this.loading.set(true);
    this.error.set(null);
    try {
      await this.auth.login(username, password);
      void this.router.navigate(['/payments']);
    } catch (caught) {
      const message = (caught as { error?: { message?: unknown } })?.error?.message;
      this.error.set(
        typeof message === 'string' ? message : 'ورود به پنل ممکن نشد',
      );
    } finally {
      this.loading.set(false);
    }
  }
}
