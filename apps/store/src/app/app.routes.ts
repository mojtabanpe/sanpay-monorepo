import { Route } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const appRoutes: Route[] = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage),
  },
  {
    // پوستهٔ مشترک: سربرگ + ناوبری. گارد روی والد است تا هر صفحهٔ تازه‌ای که
    // زیر این مسیر اضافه شود، به‌صورت پیش‌فرض محافظت‌شده باشد.
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/shell/shell').then((m) => m.ShellPage),
    children: [
      {
        path: 'payments',
        loadComponent: () =>
          import('./pages/payments/payments').then((m) => m.PaymentsPage),
      },
      {
        path: 'qr',
        loadComponent: () => import('./pages/qr/qr').then((m) => m.QrPage),
      },
      // فرزندِ پوسته، نه مسیر هم‌سطح: اگر بیرون بماند، مسیر '' اول با پوسته
      // تطبیق داده می‌شود، هیچ فرزندی '' را نمی‌گیرد و تطبیق شکست می‌خورد.
      { path: '', redirectTo: 'payments', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: '' },
];
