import { Route } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const appRoutes: Route[] = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage),
  },
  {
    path: 'payments',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/payments/payments').then((m) => m.PaymentsPage),
  },
  { path: '', redirectTo: 'payments', pathMatch: 'full' },
  { path: '**', redirectTo: '' },
];
