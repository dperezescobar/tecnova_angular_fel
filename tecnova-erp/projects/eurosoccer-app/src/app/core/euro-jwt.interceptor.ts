import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { EuroAuthService } from './euro-auth.service';

export const euroJwtInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(EuroAuthService);
  const isAuthEndpoint = req.url.includes('/Auth/PostToken') || req.url.includes('/Auth/ResyncSession');
  const isSetEmpresaEndpoint = req.url.includes('/Auth/SetEmpresaSession');

  if (isAuthEndpoint) {
    return next(req);
  }

  const token = authService.getToken();
  let authReq = req;
  if (token) {
    authReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (isSetEmpresaEndpoint || error.status !== 401) {
        return throwError(() => error);
      }

      // Access token vencido (15 min): canjear refresh token una sola vez y reintentar.
      return authService.recoverSession().pipe(
        switchMap((nuevoToken) => next(req.clone({ setHeaders: { Authorization: `Bearer ${nuevoToken}` } }))),
        catchError((recoverError) => {
          authService.logout();
          return throwError(() => recoverError);
        })
      );
    })
  );
};