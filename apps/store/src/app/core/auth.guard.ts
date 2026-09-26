import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { StoreAuthService } from './store-auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(StoreAuthService);
  const router = inject(Router);
  return (await auth.ensureSession()) ? true : router.createUrlTree(['/login']);
};
