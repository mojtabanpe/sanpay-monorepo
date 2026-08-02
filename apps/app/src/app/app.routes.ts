import { Route } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

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
      { path: '', redirectTo: 'home', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: '' },
];
