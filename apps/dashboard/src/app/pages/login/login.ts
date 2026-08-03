import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { HlmAlertImports } from '@sanpay/ui/alert';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmFieldImports } from '@sanpay/ui/field';
import { HlmInputImports } from '@sanpay/ui/input';
import { AdminAuthService } from '../../core/admin-auth.service';
import { apiError } from '../../core/admin-api.service';

@Component({
  selector: 'app-login',
  imports: [
    HlmAlertImports,
    HlmButtonImports,
    HlmCardImports,
    HlmFieldImports,
    HlmInputImports,
  ],
  templateUrl: './login.html',
})
export class LoginPage {
  private readonly auth = inject(AdminAuthService);
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
      void this.router.navigate(['/overview']);
    } catch (caught) {
      this.error.set(apiError(caught, 'ورود به داشبورد ممکن نشد'));
    } finally {
      this.loading.set(false);
    }
  }
}
