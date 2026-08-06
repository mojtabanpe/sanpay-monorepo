import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
} from '@angular/router';
import { providePersianDates } from '@sanpay/dates';
import { appRoutes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // پروندهٔ کارمند `id` را با input می‌گیرد، پس اتصال ورودی به پارامتر مسیر لازم است
    // withInMemoryScrolling: بدون آن، رفتن از انتهای یک جدول بلند به صفحهٔ بعد
    // اسکرول را همان‌جا نگه می‌دارد و صفحهٔ جدید از وسط باز می‌شود.
    provideRouter(
      appRoutes,
      withComponentInputBinding(),
      withInMemoryScrolling({
        scrollPositionRestoration: 'enabled',
        anchorScrolling: 'enabled',
      }),
    ),
    provideHttpClient(withInterceptors([authInterceptor])),
    // تقویم شمسی برای هر hlm-calendar / hlm-date-picker در داشبورد
    providePersianDates(),
  ],
};
