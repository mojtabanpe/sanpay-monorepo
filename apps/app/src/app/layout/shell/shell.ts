import { Component, computed, inject, signal } from '@angular/core';
import {
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { HlmButtonImports } from '@sanpay/ui/button';
import { AuthService } from '@sanpay/applets/auth';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, HlmButtonImports],
  templateUrl: './shell.html',
})
export class ShellComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly company = computed(() => this.auth.profile()?.company);

  constructor() {
    void this.auth.refreshProfile().catch(() => undefined);
  }

  protected readonly fullName = computed(() => {
    const profile = this.auth.profile();
    return profile ? `${profile.firstName} ${profile.lastName}` : '';
  });

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

  protected back(): void {
    if (
      ['/home', '/stores', '/qr', '/tourism', '/profile'].includes(
        this.router.url,
      )
    ) {
      void this.router.navigate(['/home']);
      return;
    }
    history.back();
  }
}
