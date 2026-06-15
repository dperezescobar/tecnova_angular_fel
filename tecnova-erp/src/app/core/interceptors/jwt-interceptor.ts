import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth';

const normalizeBaseUrl = (value: string): string => String(value ?? '').trim().replace(/\/+$/, '').toLowerCase();

const shouldSkipAuthHeader = (url: string, authService: AuthService): boolean => {
  const requestUrl = String(url ?? '').trim().toLowerCase();
  if (!requestUrl) {
    return false;
  }

  if (requestUrl.includes('maildte.kulstoresv.com')) {
    return true;
  }

  const emissionBaseUrl = normalizeBaseUrl(authService.getEmissionApiBaseUrl());
  if (emissionBaseUrl && requestUrl.startsWith(emissionBaseUrl)) {
    return true;
  }

  return false;
};

const shouldLogoutOnAuthFailure = (error: unknown): boolean => {
  if (!(error instanceof HttpErrorResponse)) {
    return false;
  }

  if (error.status === 400 || error.status === 401) {
    return true;
  }

  return false;
};

export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const isAuthEndpoint = req.url.includes('/Auth/PostToken') || req.url.includes('/Auth/RefreshToken');
  const isSetEmpresaEndpoint = req.url.includes('/Auth/SetEmpresaSession');
  const skipAuthHeader = shouldSkipAuthHeader(req.url, authService);

  if (isAuthEndpoint) {
    return next(req);
  }

  // 1. Obtener el token actual
  const token = authService.getAccessToken();

  // 2. Si existe, clonar la petición y pegarle el token en el Header
  let authReq = req;
  if (token && !skipAuthHeader) {
    authReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  // 3. Enviar la petición y esperar respuesta
  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (isSetEmpresaEndpoint) {
        return throwError(() => error);
      }

      // 4. Si la API responde 401, intentamos recuperar sesión una sola vez y reintentamos.
      if (error.status === 401) {
        return authService.recoverSession().pipe(
          switchMap((tokenRecuperado) => {
            const newReq = skipAuthHeader
              ? req
              : req.clone({
                setHeaders: {
                  Authorization: `Bearer ${tokenRecuperado}`
                }
              });

            return next(newReq);
          }),
          catchError((recoverError) => {
            if (shouldLogoutOnAuthFailure(recoverError) || shouldLogoutOnAuthFailure(error)) {
              authService.logout();
            }

            return throwError(() => recoverError);
          })
        );
      }

      // Si es otro error (ej. 500, 404), solo lo lanzamos
      return throwError(() => error);
    })
  );
};