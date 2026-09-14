import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, switchMap, map, of, catchError, throwError, shareReplay, finalize } from 'rxjs';
import { environment } from '../../environments/environment';

export interface EuroUser {
  username: string;
  token: string;
  refreshToken: string;
  tenant: string;
  idEmpresa?: number;
  nombreEmpresa?: string;
  tipoUsuario?: string;
  esRoot?: boolean;
  nombreUsuario?: string;
}

@Injectable({
  providedIn: 'root'
})
export class EuroAuthService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiUrl;
  private readonly systemId = 5; // Sistema EUROSOCCER
  private readonly TOKEN_KEY = 'euro_token';
  private readonly USER_KEY = 'euro_user';

  currentUser = signal<EuroUser | null>(this.getStoredUser());
  private recoverSessionRequest$: Observable<string> | null = null;

  login(credenciales: { usuario: string; clave: string }): Observable<EuroUser> {
    // 1. Obtener Token JWT
    return this.http.post<any>(`${this.baseUrl}/Auth/PostToken`, {
      user: credenciales.usuario,
      pass: credenciales.clave,
      idsistema: this.systemId
    }).pipe(
      switchMap((res: any) => {
        const token = res?.token || res?.Token;
        const refreshToken = res?.refreshToken || res?.RefreshToken || '';
        if (!token) throw new Error('No se recibió token de autenticación.');

        const authHeaders = { headers: { Authorization: `Bearer ${token}` } };
        const username = credenciales.usuario;

        // 2. Resolver dinámicamente las empresas del usuario desde la API (sin quemar ID numérico)
        return this.http.get<any[]>(
          `${this.baseUrl}/Data/getempresas?usuario=${encodeURIComponent(username)}&idsistema=${this.systemId}`,
          authHeaders
        ).pipe(
          switchMap((empresas: any[]) => {
            if (!empresas || empresas.length === 0) {
              throw new Error(`El usuario ${username} no tiene empresas asignadas.`);
            }

            // Buscar la empresa por su base de datos / tenant configurado (o tomar la asignada)
            const targetTenant = (environment.defaultTenant || '').toLowerCase();
            const matchedEmpresa = empresas.find(e =>
              String(e.dbName || e.DbName || e.dbname || e.DBNAME || '').toLowerCase() === targetTenant
            ) || empresas[0];

            const resolvedIdEmpresa = Number(matchedEmpresa.idEmpresa ?? matchedEmpresa.IdEmpresa ?? 0);
            if (!resolvedIdEmpresa) {
              throw new Error('No se pudo determinar el ID de empresa para la sesión.');
            }

            const nombreEmpresa = String(matchedEmpresa.nombreComercial || matchedEmpresa.nombre || matchedEmpresa.NOMBRE || '');

            // 3. Registrar sesión multi-tenant con el ID de empresa resuelto dinámicamente
            return this.http.post<any>(
              `${this.baseUrl}/Auth/SetEmpresaSession`,
              { idEmpresa: resolvedIdEmpresa },
              authHeaders
            ).pipe(
              map(() => {
                const user: EuroUser = {
                  username,
                  token,
                  refreshToken,
                  tenant: matchedEmpresa.dbName || matchedEmpresa.dbname || environment.defaultTenant,
                  idEmpresa: resolvedIdEmpresa,
                  nombreEmpresa,
                  tipoUsuario: res?.tipoUsuario || res?.TipoUsuario || 'U',
                  esRoot: res?.esRoot === true || res?.EsRoot === true,
                  nombreUsuario: res?.nombreUsuario || res?.NombreUsuario || username
                };

                localStorage.setItem(this.TOKEN_KEY, token);
                localStorage.setItem(this.USER_KEY, JSON.stringify(user));
                this.currentUser.set(user);
                return user;
              })
            );
          })
        );
      })
    );
  }

  ensureEmpresaSession(): Observable<any> {
    const token = this.getToken();
    const user = this.currentUser();
    if (!token || !user) return of(null);

    const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

    // Si ya se tiene el idEmpresa en la sesión activa, vincular la sesión directamente
    if (user.idEmpresa) {
      return this.http.post<any>(
        `${this.baseUrl}/Auth/SetEmpresaSession`,
        { idEmpresa: user.idEmpresa },
        authHeaders
      );
    }

    // Si la sesión local guardada no tenía idEmpresa, consultarlo dinámicamente
    return this.http.get<any[]>(
      `${this.baseUrl}/Data/getempresas?usuario=${encodeURIComponent(user.username)}&idsistema=${this.systemId}`,
      authHeaders
    ).pipe(
      switchMap((empresas: any[]) => {
        if (!empresas || empresas.length === 0) return of(null);
        const targetTenant = (environment.defaultTenant || '').toLowerCase();
        const matchedEmpresa = empresas.find(e =>
          String(e.dbName || e.DbName || e.dbname || e.DBNAME || '').toLowerCase() === targetTenant
        ) || empresas[0];

        const resolvedIdEmpresa = Number(matchedEmpresa.idEmpresa ?? matchedEmpresa.IdEmpresa ?? 0);
        if (!resolvedIdEmpresa) return of(null);

        user.idEmpresa = resolvedIdEmpresa;
        user.nombreEmpresa = String(matchedEmpresa.nombreComercial || matchedEmpresa.nombre || matchedEmpresa.NOMBRE || '');
        localStorage.setItem(this.USER_KEY, JSON.stringify(user));
        this.currentUser.set({ ...user });

        return this.http.post<any>(
          `${this.baseUrl}/Auth/SetEmpresaSession`,
          { idEmpresa: resolvedIdEmpresa },
          authHeaders
        );
      }),
      catchError(() => of(null))
    );
  }

  // El access token expira a los 15 min. Ante un 401, el interceptor llama esto una sola vez
  // (deduplicado vía shareReplay) para canjear el refresh token por uno nuevo y reintentar.
  recoverSession(): Observable<string> {
    if (this.recoverSessionRequest$) {
      return this.recoverSessionRequest$;
    }

    const user = this.currentUser();
    if (!user?.refreshToken) {
      return throwError(() => new Error('No hay sesión activa para recuperar.'));
    }

    const request$ = this.http.post<any>(`${this.baseUrl}/Auth/ResyncSession`, {
      Token: user.token,
      RefreshToken: user.refreshToken,
      Username: user.username
    }).pipe(
      switchMap((res: any) => {
        const nuevoToken = res?.token || res?.Token;
        if (!nuevoToken) return throwError(() => new Error('No se pudo recuperar el token de sesión.'));

        const nuevoRefresh = res?.refreshToken || res?.RefreshToken || user.refreshToken;
        const actualizado: EuroUser = { ...user, token: nuevoToken, refreshToken: nuevoRefresh };
        localStorage.setItem(this.TOKEN_KEY, nuevoToken);
        localStorage.setItem(this.USER_KEY, JSON.stringify(actualizado));
        this.syncContaskSession(actualizado);
        this.currentUser.set(actualizado);
        return of(nuevoToken);
      }),
      finalize(() => { this.recoverSessionRequest$ = null; }),
      shareReplay(1)
    );

    this.recoverSessionRequest$ = request$;
    return request$;
  }

  logout(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    localStorage.removeItem('contask_session');
    this.currentUser.set(null);
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  isAdmin(): boolean {
    const user = this.currentUser();
    if (!user) return false;
    const tipo = (user.tipoUsuario || '').toUpperCase();
    return user.esRoot === true ||
      tipo === 'A' ||
      tipo === 'ADMIN' ||
      tipo === 'ADMINISTRADOR' ||
      user.username?.toLowerCase() === 'dperezescobar@gmail.com';
  }

  private syncContaskSession(user: EuroUser): void {
    try {
      const contaskSession = {
        token: user.token,
        refreshToken: user.refreshToken,
        username: user.username,
        nombreUsuario: user.nombreUsuario,
        tipoUsuario: user.tipoUsuario,
        esRoot: user.esRoot,
        selectedEmpresa: {
          idEmpresa: user.idEmpresa ?? 0,
          nombreEmpresa: user.nombreEmpresa ?? 'EUROSOCCER',
          nombreComercial: user.nombreEmpresa ?? 'EUROSOCCER',
          dbName: user.tenant,
          emiteDte: true,
          ambienteEmision: 1
        }
      };
      localStorage.setItem('contask_session', JSON.stringify(contaskSession));
    } catch {
      // Ignorar en entornos sin localStorage
    }
  }

  private getStoredUser(): EuroUser | null {
    const raw = localStorage.getItem(this.USER_KEY);
    if (!raw) return null;
    try {
      const u = JSON.parse(raw) as EuroUser;
      this.syncContaskSession(u);
      return u;
    } catch {
      return null;
    }
  }
}