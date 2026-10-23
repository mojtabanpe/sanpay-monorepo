import { Route } from '@angular/router';

/**
 * UPG — درگاه پرداخت یکپارچه. هر پرداخت کارمند (فروشگاه، هتل، پرواز، …) به
 * `/upg/:intentId` می‌آید؛ اینجا تقسیم بین اعتبار و کارت انتخاب و پرداخت
 * انجام می‌شود. درگاه بانکی کاربر را به `/upg/:intentId/result` برمی‌گرداند.
 */
export const upgRoutes: Route[] = [
  {
    path: ':intentId',
    loadComponent: () => import('./pages/upg-pay').then((m) => m.UpgPayPage),
  },
  {
    path: ':intentId/result',
    loadComponent: () =>
      import('./pages/upg-result').then((m) => m.UpgResultPage),
  },
];
