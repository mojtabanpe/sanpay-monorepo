import { Route } from '@angular/router';
import { authGuard } from '@sanpay/applets/auth';

export const appRoutes: Route[] = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage),
  },
  {
    path: '',
    loadComponent: () => import('./layout/shell/shell').then((m) => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      { path: 'home', loadComponent: () => import('./pages/home/home').then((m) => m.HomePage) },
      { path: 'qr', loadComponent: () => import('./pages/pay/pay').then((m) => m.PayPage) },
      // اپلت فروشگاه‌ها — فروشگاه‌های قابل استفاده با کیف‌پول‌های کارمند
      {
        path: 'stores',
        loadChildren: () =>
          import('@sanpay/applets/stores').then((m) => m.storesRoutes),
      },
      // اپلت گردشگری — روت‌هایش داخل خود اپلت تعریف شده‌اند
      {
        path: 'tourism',
        loadChildren: () =>
          import('@sanpay/applets/tourism').then((m) => m.tourismRoutes),
      },
      // اپلت پروفایل — هویت، وضعیت اعتبار، تاریخچهٔ خرید، رمز عبور و پشتیبانی
      {
        path: 'profile',
        loadChildren: () =>
          import('@sanpay/applets/profile').then((m) => m.profileRoutes),
      },
      { path: '', redirectTo: 'home', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: '' },
];
