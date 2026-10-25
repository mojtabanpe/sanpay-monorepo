import { Route } from '@angular/router';

/** روت‌های اپلت پروفایل — اپ میزبان با `loadChildren` سوارشان می‌کند */
export const profileRoutes: Route[] = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/profile-home').then((m) => m.ProfileHomePage),
  },
  {
    path: 'sessions',
    loadComponent: () => import('./pages/sessions').then((m) => m.SessionsPage),
  },
  {
    path: 'wallet-transactions',
    loadComponent: () =>
      import('./pages/wallet-transactions').then(
        (m) => m.WalletTransactionsPage,
      ),
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
