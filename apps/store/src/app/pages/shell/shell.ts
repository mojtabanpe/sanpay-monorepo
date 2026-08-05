import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { HlmButtonImports } from '@sanpay/ui/button';
import { StoreAuthService } from '../../core/store-auth.service';

/**
 * پوستهٔ پنل فروشنده — سربرگ فروشگاه و ناوبری بین «فروش‌ها» و «کد QR».
 *
 * پیش از این پنل فقط یک صفحه داشت و هیچ ناوبری‌ای لازم نبود؛ حالا که صفحهٔ
 * کد QR اضافه شده، سربرگ از صفحهٔ پرداخت‌ها به اینجا منتقل شده تا در هر دو
 * صفحه یکسان باشد و دو بار نوشته نشود.
 */
@Component({
  selector: 'store-shell',
  imports: [
    HlmButtonImports,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
  ],
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
