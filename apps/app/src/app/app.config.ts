import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { appRoutes } from './app.routes';
import { authInterceptor } from '@sanpay/applets/auth';
import { providePersianDates } from './core/date/persian-date';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
    provideHttpClient(withInterceptors([authInterceptor])),
    // تقویم شمسی برای هر hlm-calendar / hlm-date-picker در اپ و اپلت‌ها
    providePersianDates(),
  ],
};
