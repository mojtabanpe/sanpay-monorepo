import { AdminResource } from '@sanpay/models';
import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { AdminAuthService } from './admin-auth.service';

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AdminAuthService);
  const router = inject(Router);
  return auth.isLoggedIn() ? true : router.createUrlTree(['/login']);
};

/** مسیرهای مخصوص مدیر ارشد (مدیریت کاربران داشبورد) */
export const superAdminGuard: CanActivateFn = () => {
  const auth = inject(AdminAuthService);
  const router = inject(Router);
  return auth.isSuperAdmin() ? true : router.createUrlTree(['/']);
};

/** Refresh grants before each page, including an already-open dashboard. */
export const adminPermissionGuard: CanActivateChildFn = async (route) => {
  const auth = inject(AdminAuthService);
  const router = inject(Router);
  try {
    await auth.refresh();
  } catch {
    auth.logout();
    return router.createUrlTree(['/login']);
  }
  if (route.routeConfig?.path === 'admins' && !auth.isSuperAdmin()) {
    return router.parseUrl(auth.landingPath());
  }
  const resource = route.data['adminResource'] as AdminResource | undefined;
  if (!resource || auth.hasPermission(`${resource}:read`)) return true;
  return router.parseUrl(auth.landingPath());
};
