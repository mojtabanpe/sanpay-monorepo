import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { appRoutes } from './app.routes';
import { authInterceptor } from '@sanpay/applets/auth';
import { providePersianDates } from '@sanpay/dates';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // بدون این، انگولار موقع تعویض مسیر اسکرول را دست نمی‌زند و صفحهٔ جدید از
    // وسط باز می‌شود. `enabled` (نه `top`) یعنی در back/forward موقعیت قبلی
    // برمی‌گردد و فقط ناوبری تازه به بالا می‌رود.
    provideRouter(
      appRoutes,
      withInMemoryScrolling({
        scrollPositionRestoration: 'enabled',
        anchorScrolling: 'enabled',
      }),
    ),
    provideHttpClient(withInterceptors([authInterceptor])),
    // تقویم شمسی برای هر hlm-calendar / hlm-date-picker در اپ و اپلت‌ها
    providePersianDates(),
  ],
};
