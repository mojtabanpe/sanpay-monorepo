import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { StoreAuthService } from './store-auth.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(StoreAuthService);
  const router = inject(Router);
  const token = auth.token;

  const authorized = token
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;

  return next(authorized).pipe(
    catchError((error: { status?: number }) => {
      if (error.status === 401) {
        auth.logout();
        void router.navigate(['/login']);
      }
      return throwError(() => error);
    }),
  );
};
