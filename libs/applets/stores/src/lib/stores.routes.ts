import { Route } from '@angular/router';

/** روت‌های اپلت فروشگاه‌ها — اپ میزبان با `loadChildren` سوارشان می‌کند */
export const storesRoutes: Route[] = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/store-list').then((m) => m.StoreListPage),
  },
];
