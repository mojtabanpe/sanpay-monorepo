import { Route } from '@angular/router';

/** روت‌های اپلت پروفایل — اپ میزبان با `loadChildren` سوارشان می‌کند */
export const profileRoutes: Route[] = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/profile-home').then((m) => m.ProfileHomePage),
  },
  {
    path: 'payments',
    loadComponent: () =>
      import('./pages/payment-history').then((m) => m.PaymentHistoryPage),
  },
  {
    path: 'password',
    loadComponent: () =>
      import('./pages/change-password').then((m) => m.ChangePasswordPage),
  },
  {
    path: 'support',
    loadComponent: () => import('./pages/support').then((m) => m.SupportPage),
  },
];
