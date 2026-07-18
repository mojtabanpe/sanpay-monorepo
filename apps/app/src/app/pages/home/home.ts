import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-home',
  imports: [HlmButtonImports, HlmCardImports],
  templateUrl: './home.html',
})
export class HomePage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly personnelCode = this.auth.personnelCode;

  protected logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
