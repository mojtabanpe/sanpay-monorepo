import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AdminAuthService } from './admin-auth.service';

/** توکن مدیر را اضافه می‌کند و روی ۴۰۱ به صفحهٔ ورود برمی‌گردد */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AdminAuthService);
  const router = inject(Router);

  const token = auth.token;
  const authorized = token
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;

  return next(authorized).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !request.url.includes('/admin/auth/login')
      ) {
        auth.logout();
        void router.navigate(['/login']);
      }
      return throwError(() => error);
    }),
  );
};
