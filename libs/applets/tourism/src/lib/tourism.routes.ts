import { Route } from '@angular/router';

/**
 * روت‌های اپلت گردشگری. اپ میزبان با `loadChildren` زیر مسیر دلخواه سوارشان
 * می‌کند؛ اپلت خودش نمی‌داند زیر کدام prefix نشسته است — به‌جز پیمایش‌های
 * داخلی که به `/tourism` اشاره می‌کنند.
 */
export const tourismRoutes: Route[] = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/hotel-list').then((m) => m.HotelListPage),
  },
  {
    path: 'hotels/:hotelId',
    loadComponent: () =>
      import('./pages/hotel-detail').then((m) => m.HotelDetailPage),
  },
  {
    path: 'book',
    loadComponent: () => import('./pages/booking').then((m) => m.BookingPage),
  },
  {
    path: 'bookings',
    loadComponent: () =>
      import('./pages/my-bookings').then((m) => m.MyBookingsPage),
  },
];
