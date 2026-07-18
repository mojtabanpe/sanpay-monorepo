import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { HlmButtonImports } from '@sanpay/ui/button';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, HlmButtonImports],
  templateUrl: './shell.html',
})
export class ShellComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly personnelCode = this.auth.personnelCode;

  protected logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
