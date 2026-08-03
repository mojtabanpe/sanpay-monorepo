import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
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

  protected readonly fullName = computed(() => {
    const profile = this.auth.profile();
    return profile ? `${profile.firstName} ${profile.lastName}` : '';
  });

  protected logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
