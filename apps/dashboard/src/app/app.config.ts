import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { providePersianDates } from '@sanpay/dates';
import { appRoutes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // پروندهٔ کارمند `id` را با input می‌گیرد، پس اتصال ورودی به پارامتر مسیر لازم است
    provideRouter(appRoutes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor])),
    // تقویم شمسی برای هر hlm-calendar / hlm-date-picker در داشبورد
    providePersianDates(),
  ],
};
