import { Component, inject } from '@angular/core';
import {
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { HlmButtonImports } from '@sanpay/ui/button';
import { StoreAuthService } from '../../core/store-auth.service';

/** پوستهٔ پنل فروشگاه: سایدبار دسکتاپ و سربرگ/تب‌های موبایل. */
@Component({
  selector: 'store-shell',
  imports: [HlmButtonImports, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './shell.html',
})
export class ShellPage {
  private readonly auth = inject(StoreAuthService);
  private readonly router = inject(Router);

  protected readonly store = this.auth.profile;

  protected logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
