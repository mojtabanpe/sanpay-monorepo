import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { StoreAuthService } from './store-auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(StoreAuthService);
  const router = inject(Router);
  return auth.isLoggedIn() ? true : router.createUrlTree(['/login']);
};
