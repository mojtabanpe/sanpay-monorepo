import { Route } from '@angular/router';
import { adminGuard, superAdminGuard } from './core/auth.guard';

/**
 * ورود بیرون از پوسته است؛ بقیهٔ صفحات داخل `Shell` (نوار کناری + محتوای تمام‌عرض)
 * و پشت `adminGuard` قرار می‌گیرند.
 */
export const appRoutes: Route[] = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage),
  },
  {
    path: '',
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    canActivate: [adminGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'overview' },
      {
        path: 'overview',
        loadComponent: () =>
          import('./pages/overview/overview').then((m) => m.OverviewPage),
      },
      {
        path: 'employees',
        loadComponent: () =>
          import('./pages/employees/employees').then((m) => m.EmployeesPage),
      },
      {
        path: 'employees/:id',
        loadComponent: () =>
          import('./pages/employee-detail/employee-detail').then(
            (m) => m.EmployeeDetailPage,
          ),
      },
      {
        path: 'wallets',
        loadComponent: () =>
          import('./pages/wallets/wallets').then((m) => m.WalletsPage),
      },
      {
        path: 'stores',
        loadComponent: () =>
          import('./pages/stores/stores').then((m) => m.StoresPage),
      },
      {
        path: 'payments',
        loadComponent: () =>
          import('./pages/payments/payments').then((m) => m.PaymentsPage),
      },
      {
        path: 'bookings',
        loadComponent: () =>
          import('./pages/bookings/bookings').then((m) => m.BookingsPage),
      },
      {
        path: 'admins',
        canActivate: [superAdminGuard],
        loadComponent: () =>
          import('./pages/admins/admins').then((m) => m.AdminsPage),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./pages/settings/settings').then((m) => m.SettingsPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
