import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, map, of, shareReplay, switchMap, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthResponse, CompletarCambioPasswordRequest, Empresa, UserSession } from '../models/auth.models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private apiUrl = environment.apiUrl;
  private readonly systemId = 2;
  private empresaSessionHydrationTried = false;
  private refreshTokenRequest$: Observable<AuthResponse> | null = null;
  private resyncRequest$: Observable<AuthResponse> | null = null;
  private restoreEmpresaSessionRequest$: Observable<void> | null = null;
  private recoverSessionRequest$: Observable<string> | null = null;
  private refreshTimer: any;

  // Signal reactivo para toda la app
  currentUser = signal<UserSession | null>(null);

  constructor() {
    this.restoreSession();
  }

  private normalizeAuthResponse(response: Partial<AuthResponse> & {
    Token?: string;
    RefreshToken?: string;
    Username?: string;
    Expiration?: string;
    fechaActual?: string;
    FechaActual?: string;
    DUI?: string;
    dui?: string;
    NombreUsuario?: string;
    nombreUsuario?: string;
    TipoUsuario?: string;
    tipoUsuario?: string;
    Bloqueado?: boolean | string | number;
    bloqueado?: boolean | string | number;
    EsRoot?: boolean | string | number;
    esRoot?: boolean | string | number;
    RequierePasswordChange?: boolean;
    requierePasswordChange?: boolean;
  }): AuthResponse {
    const toBool = (raw: boolean | string | number | undefined) =>
      typeof raw === 'boolean' ? raw : ['1', 'true', 'si', 'sí'].includes(String(raw ?? '').trim().toLowerCase());

    const username = response.username ?? response.Username ?? '';
    const requierePasswordChange = !!(response.requierePasswordChange ?? response.RequierePasswordChange);

    if (requierePasswordChange) {
      return {
        token: '',
        refreshToken: '',
        username,
        expiration: new Date().toISOString(),
        requierePasswordChange: true
      };
    }

    const token = response.token ?? response.Token;
    const refreshToken = response.refreshToken ?? response.RefreshToken;
    const expiration = response.expiration ?? response.Expiration ?? new Date().toISOString();
    const fechaActual = String(response.fechaActual ?? response.FechaActual ?? '').trim() || undefined;
    const dui = String(response.dui ?? response.DUI ?? '').trim() || undefined;
    const nombreUsuario = String(response.nombreUsuario ?? response.NombreUsuario ?? '').trim() || undefined;
    const tipoUsuario = String(response.tipoUsuario ?? response.TipoUsuario ?? '').trim() || undefined;
    const bloqueado = toBool(response.bloqueado ?? response.Bloqueado);
    const esRoot = toBool(response.esRoot ?? response.EsRoot);

    if (!token || !refreshToken) {
      throw new Error('Respuesta de autenticación inválida: faltan token o refreshToken');
    }

    return {
      token,
      refreshToken,
      username,
      expiration,
      fechaActual,
      dui,
      nombreUsuario,
      tipoUsuario,
      bloqueado,
      esRoot,
      requierePasswordChange: false
    };
  }

  private normalizeEmpresa(raw: Partial<Empresa> & { [key: string]: unknown }): Empresa {
    const dbName = String(
      raw.dbName ??
      raw['DbName'] ??
      raw['baseDatos'] ??
      raw['BaseDatos'] ??
      raw['baseDeDatos'] ??
      raw['BaseDeDatos'] ??
      raw['database'] ??
      raw['Database'] ??
      raw['db'] ??
      raw['DB'] ??
      ''
    );

    const urlApi = String(
      raw['urlApi'] ??
      raw['UrlAPI'] ??
      raw['URLAPI'] ??
      raw['urlAPI'] ??
      raw['UrlApi'] ??
      raw['urlServicio'] ??
      raw['UrlServicio'] ??
      ''
    );

    return {
      idEmpresa: Number(raw.idEmpresa ?? raw['IdEmpresa'] ?? 0),
      nombreComercial: String(raw.nombreComercial ?? raw['NombreComercial'] ?? ''),
      nombre: String(raw.nombre ?? raw['Nombre'] ?? ''),
      nit: String(raw.nit ?? raw['NIT'] ?? ''),
      nrc: String(raw.nrc ?? raw['NRC'] ?? ''),
      urlServicio: String(raw.urlServicio ?? raw['UrlServicio'] ?? urlApi),
      urlApi,
      logo: String(raw.logo ?? raw['Logo'] ?? ''),
      ambienteEmision: Number(raw.ambienteEmision ?? raw['AmbienteEmision'] ?? 0),
      dbName
    };
  }

  private shouldUseLocalEmissionProxy(base: string): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    const hostname = window.location.hostname.toLowerCase();
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
    if (!isLocalhost) {
      return false;
    }

    try {
      const emissionUrl = new URL(base);
      return emissionUrl.origin.toLowerCase() !== window.location.origin.toLowerCase();
    } catch {
      return false;
    }
  }

  getEmissionApiBaseUrl(): string {
    const empresa = this.currentUser()?.selectedEmpresa;
    const base = String(empresa?.urlApi ?? empresa?.urlServicio ?? '').trim();

    if (!base) {
      return '';
    }

    if (this.shouldUseLocalEmissionProxy(base)) {
      return '/dte-proxy/';
    }

    return base.endsWith('/') ? base : `${base}/`;
  }

  private saveSession(
    token: string,
    refreshToken: string,
    username: string,
    empresa: Empresa,
    authData?: Partial<AuthResponse>
  ) {
    const previous = this.currentUser();

    const session: UserSession = {
      token,
      refreshToken,
      username,
      expiration: authData?.expiration ?? previous?.expiration,
      fechaActual: authData?.fechaActual ?? previous?.fechaActual,
      dui: authData?.dui ?? previous?.dui,
      nombreUsuario: authData?.nombreUsuario ?? previous?.nombreUsuario,
      tipoUsuario: authData?.tipoUsuario ?? previous?.tipoUsuario,
      bloqueado: authData?.bloqueado ?? previous?.bloqueado,
      esRoot: authData?.esRoot ?? previous?.esRoot,
      selectedEmpresa: empresa
    };

    localStorage.setItem('contask_session', JSON.stringify(session));
    this.currentUser.set(session);
    this.scheduleTokenRefresh(session.expiration);
  }

  getCurrentNombreUsuario(): string {
    return String(this.currentUser()?.nombreUsuario ?? '').trim();
  }

  getCurrentDui(): string {
    return String(this.currentUser()?.dui ?? '').trim();
  }

  isCurrentUserBlocked(): boolean {
    return !!this.currentUser()?.bloqueado;
  }

  isRoot(): boolean {
    return !!this.currentUser()?.esRoot;
  }

  // Paso 1: Obtener Token
  login(user: string, pass: string, idsistema: number = this.systemId): Observable<AuthResponse> {
    return this.http
      .post<Partial<AuthResponse> & { Token?: string; RefreshToken?: string; Username?: string; Expiration?: string }>(
        `${this.apiUrl}/Auth/PostToken`,
        { user, pass, idsistema }
      )
      .pipe(map((response) => this.normalizeAuthResponse(response)));
  }

  // Completa el cambio de contraseña cuando el login detecta PoliticaNuevoPassword activa.
  // Si la contraseña actual/nueva son válidas, la API responde con un login completo (token + refreshToken).
  completarCambioPasswordReiniciado(request: CompletarCambioPasswordRequest): Observable<AuthResponse> {
    return this.http
      .post<Partial<AuthResponse> & { Token?: string; RefreshToken?: string; Username?: string; Expiration?: string }>(
        `${this.apiUrl}/Auth/CompletarCambioPasswordReiniciado`,
        request
      )
      .pipe(map((response) => this.normalizeAuthResponse(response)));
  }
// NUEVO: Solicitar código de acceso por correo
  requestAccessCode(user: string): Observable<void> {
    const url = `https://maildte.kulstoresv.com/api/Util/AccessCode?user=${encodeURIComponent(user)}`;
    // Es un POST con query param, enviamos un body vacío {}
    return this.http.post<void>(url, {});
  }
  // Paso 2: Obtener Empresas
  getEmpresas(usuario: string, token?: string, idsistema: number = this.systemId): Observable<Empresa[]> {
    const usuarioEncoded = encodeURIComponent(usuario);
    const options = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
    return this.http
      .get<Array<Partial<Empresa> & { [key: string]: unknown }>>(
        `${this.apiUrl}/Data/getempresas?usuario=${usuarioEncoded}&idsistema=${idsistema}`,
        options
      )
      .pipe(
        map((empresas) => empresas.map((empresa) => this.normalizeEmpresa(empresa))),
        catchError((error) => {
          if (error?.status === 404) {
            return of([]);
          }
          return throwError(() => error);
        })
      );
  }

  createEmpresaSession(token: string, username: string, empresa: Empresa): Observable<void> {
    const payload = {
      Token: token,
      Username: username,
      IdEmpresa: empresa.idEmpresa
    };

    return this.http
      .post(`${this.apiUrl}/Auth/SetEmpresaSession`, payload)
      .pipe(map(() => void 0));
  }

  restoreEmpresaSession(): Observable<void> {
    if (this.restoreEmpresaSessionRequest$) {
      return this.restoreEmpresaSessionRequest$;
    }

    const user = this.currentUser();
    if (!user?.token || !user?.username || !user?.selectedEmpresa) {
      return throwError(() => new Error('No hay sesión de empresa para restaurar.'));
    }

    const request$ = this.createEmpresaSession(user.token, user.username, user.selectedEmpresa).pipe(
      tap(() => {
        this.empresaSessionHydrationTried = true;
      }),
      catchError((error) => {
        this.empresaSessionHydrationTried = false;
        return throwError(() => error);
      }),
      finalize(() => {
        this.restoreEmpresaSessionRequest$ = null;
      }),
      shareReplay(1)
    );

    this.restoreEmpresaSessionRequest$ = request$;
    return request$;
  }

  shouldHydrateEmpresaSession(): boolean {
    const user = this.currentUser();
    return !this.empresaSessionHydrationTried && !!user?.token && !!user?.username && !!user?.selectedEmpresa;
  }

  recoverSession(): Observable<string> {
    if (this.recoverSessionRequest$) {
      return this.recoverSessionRequest$;
    }

    const user = this.currentUser();
    if (!user?.token) {
      return throwError(() => new Error('No hay sesión activa para recuperar.'));
    }

    const request$ = this.resyncSession().pipe(
      map((response) => response.token),
      catchError(() => this.restoreEmpresaSession().pipe(map(() => this.getAccessToken() ?? ''))),
      switchMap((token) => {
        const resolvedToken = String(token ?? '').trim() || String(this.getAccessToken() ?? '').trim();
        if (!resolvedToken) {
          return throwError(() => new Error('No se pudo recuperar token de sesión.'));
        }
        return of(resolvedToken);
      }),
      finalize(() => {
        this.recoverSessionRequest$ = null;
      }),
      shareReplay(1)
    );

    this.recoverSessionRequest$ = request$;
    return request$;
  }

  // Finalizar sesión completa: registrar EmpresaSession y navegar
  completeLogin(
    token: string,
    refreshToken: string,
    username: string,
    empresa: Empresa,
    authData?: Partial<AuthResponse>
  ): Observable<void> {
    this.saveSession(token, refreshToken, username, empresa, authData);
    this.empresaSessionHydrationTried = false;

    // Registrar la EmpresaSession (SetEmpresaSession) ANTES de navegar. Si navegamos primero,
    // el layout dispara getAplicaInventarios/getAbonos con el token nuevo antes de que la sesión
    // quede registrada → el tenant no resuelve (EsValida) → 401 en cascada → logout.
    return this.createEmpresaSession(token, username, empresa).pipe(
      tap(() => {
        this.empresaSessionHydrationTried = true;
      }),
      catchError(() => {
        // Si el registro falla, navegamos igual; el interceptor intentará restaurar en el primer 401.
        this.empresaSessionHydrationTried = false;
        return of(void 0);
      }),
      tap(() => {
        this.router.navigate(['/inicio']);
      }),
      map(() => void 0)
    );
  }

  // Obtener el token de acceso actual
  getAccessToken(): string | null {
    const user = this.currentUser();
    return user?.token || null;
  }

  // Refrescar el token
  refreshToken(): Observable<AuthResponse> {
    if (this.refreshTokenRequest$) {
      return this.refreshTokenRequest$;
    }

    const user = this.currentUser();
    if (!user?.refreshToken || !user?.token) {
      return throwError(() => new Error('No refresh token available'));
    }

    const nowIso = new Date().toISOString();
    const refreshPayload = {
  Token: user.token,
  RefreshToken: user.refreshToken,
  Username: user.username
};
    // const refreshPayload = {
    //   Token: user.token,
    //   RefreshToken: user.refreshToken,
    //   Username: user.username,
    //   Expiration: nowIso,
    //   fechaActual: nowIso,
    //   token: user.token,
    //   refreshToken: user.refreshToken,
    //   username: user.username,
    //   expiration: nowIso,
    //   DUI: user.dui,
    //   NombreUsuario: user.nombreUsuario,
    //   TipoUsuario: user.tipoUsuario
    // };
    
    const request$ = this.http
      .post<Partial<AuthResponse> & { Token?: string; RefreshToken?: string; Username?: string; Expiration?: string }>(
        `${this.apiUrl}/Auth/RefreshToken`,
        refreshPayload
      )
      .pipe(
        map((response) => this.normalizeAuthResponse(response)),
        switchMap((response) => {
          if (!user.selectedEmpresa) {
            const updatedSession: UserSession = {
              token: response.token,
              refreshToken: response.refreshToken,
              username: response.username || user.username,
              fechaActual: response.fechaActual ?? user.fechaActual,
              dui: response.dui ?? user.dui,
              nombreUsuario: response.nombreUsuario ?? user.nombreUsuario,
              tipoUsuario: response.tipoUsuario ?? user.tipoUsuario,
              bloqueado: response.bloqueado ?? user.bloqueado,
              esRoot: response.esRoot ?? user.esRoot,
              selectedEmpresa: null
            };
            localStorage.setItem('contask_session', JSON.stringify(updatedSession));
            this.currentUser.set(updatedSession);
            return of(response);
          }

          this.saveSession(
            response.token,
            response.refreshToken,
            response.username || user.username,
            user.selectedEmpresa,
            response
          );
          this.empresaSessionHydrationTried = false;

          return this.createEmpresaSession(response.token, response.username || user.username, user.selectedEmpresa).pipe(
            tap(() => {
              this.empresaSessionHydrationTried = true;
            }),
            map(() => response)
          );
        }),
        finalize(() => {
          this.refreshTokenRequest$ = null;
        }),
        shareReplay(1)
      );

    this.refreshTokenRequest$ = request$;
    return request$;
  }

  // Sesión compartida (N4): pide el token vivo actual. El servidor devuelve el token vigente
  // (si otro dispositivo ya lo refrescó) o refresca una sola vez, y él mismo sincroniza la
  // EmpresaSession. Por eso aquí NO llamamos a createEmpresaSession (evita el SetEmpresaSession redundante).
  resyncSession(): Observable<AuthResponse> {
    if (this.resyncRequest$) {
      return this.resyncRequest$;
    }

    const user = this.currentUser();
    if (!user?.refreshToken || !user?.token) {
      return throwError(() => new Error('No refresh token available'));
    }

    const payload = { Token: user.token, RefreshToken: user.refreshToken, Username: user.username };

    const request$ = this.http
      .post<Partial<AuthResponse> & { Token?: string; RefreshToken?: string; Username?: string; Expiration?: string }>(
        `${this.apiUrl}/Auth/ResyncSession`,
        payload
      )
      .pipe(
        map((response) => this.normalizeAuthResponse(response)),
        tap((response) => {
          if (!user.selectedEmpresa) {
            const updated: UserSession = {
              token: response.token,
              refreshToken: response.refreshToken || user.refreshToken,
              username: response.username || user.username,
              fechaActual: response.fechaActual ?? user.fechaActual,
              dui: response.dui ?? user.dui,
              nombreUsuario: response.nombreUsuario ?? user.nombreUsuario,
              tipoUsuario: response.tipoUsuario ?? user.tipoUsuario,
              bloqueado: response.bloqueado ?? user.bloqueado,
              esRoot: response.esRoot ?? user.esRoot,
              selectedEmpresa: null
            };
            localStorage.setItem('contask_session', JSON.stringify(updated));
            this.currentUser.set(updated);
          } else {
            // El servidor ya sincronizó la EmpresaSession; solo persistimos localmente y reprogramamos refresh.
            this.saveSession(
              response.token,
              response.refreshToken || user.refreshToken,
              response.username || user.username,
              user.selectedEmpresa,
              response
            );
          }
        }),
        finalize(() => {
          this.resyncRequest$ = null;
        }),
        shareReplay(1)
      );

    this.resyncRequest$ = request$;
    return request$;
  }

  logout() {
    // Cierre global en el servidor (mejor esfuerzo): revoca refresh + invalida sesiones en todos
    // los dispositivos. No bloquea el cierre local; el interceptor no intenta recuperar este endpoint.
    const user = this.currentUser();
    if (user?.token) {
      this.http.post(`${this.apiUrl}/Auth/Logout`, {}).subscribe({ next: () => {}, error: () => {} });
    }
    this.clearRefreshTimer();
    localStorage.removeItem('contask_session');
    this.currentUser.set(null);
    this.router.navigate(['/login']);
  }

  private clearRefreshTimer() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private scheduleTokenRefresh(expirationIso?: string) {
    this.clearRefreshTimer();

    if (!expirationIso) return;

    try {
      const expirationDate = new Date(expirationIso).getTime();
      const now = new Date().getTime();

      // Refrescar 5 minutos antes de expirar (300,000 ms)
      const refreshBuffer = 5 * 60 * 1000;
      const delay = expirationDate - now - refreshBuffer;

      // Si el tiempo para refrescar es positivo, programamos el temporizador
      if (delay > 0) {
        //console.log(`[AuthService] Refresh proactivo programado en ${Math.round(delay / 1000 / 60)} min.`);
        this.refreshTimer = setTimeout(() => {
          this.resyncSession().subscribe({
            //next: () => console.log('[AuthService] Resync proactivo exitoso.'),
            error: (err) => console.error('[AuthService] Error en resync proactivo:', err)
          });
        }, delay);
      } else {
        // Si ya pasó el tiempo o falta muy poco, sincronizamos de inmediato (si el token no expiró ya)
        if (expirationDate > now) {
         // console.warn('[AuthService] El token está por expirar pronto. Sincronizando de inmediato.');
          this.resyncSession().subscribe();
        }
      }
    } catch (e) {
      console.error('[AuthService] Error al programar el refresh de token:', e);
    }
  }

  private restoreSession() {
    const data = localStorage.getItem('contask_session');
    if (!data) {
      return;
    }

    try {
      const session = JSON.parse(data) as UserSession;
      this.currentUser.set(session);
      this.empresaSessionHydrationTried = false;

      // Programar el refresh proactivo si hay una sesión válida restaurada
      if (session.expiration) {
        this.scheduleTokenRefresh(session.expiration);
      }

      if (session?.token && session?.username && session?.selectedEmpresa) {
        this.createEmpresaSession(session.token, session.username, session.selectedEmpresa).subscribe({
          next: () => {
            this.empresaSessionHydrationTried = true;
          },
          error: () => {
            // Si la API está caída al arrancar, no forzamos logout.
            // El interceptor reintentará restaurar la sesión de empresa en la primera petición 401.
            this.empresaSessionHydrationTried = false;
          }
        });
      }
    } catch {
      this.logout();
    }
  }

  // F1 — Adopta la sesión escrita por OTRA pestaña (evento storage). No llama al servidor.
  reloadFromStorage() {
    const data = localStorage.getItem('contask_session');
    if (!data) {
      return;
    }
    try {
      const session = JSON.parse(data) as UserSession;
      const actual = this.currentUser();
      if (actual?.token === session.token && actual?.refreshToken === session.refreshToken) {
        return; // sin cambios: evita reprogramar en bucle entre pestañas
      }
      this.currentUser.set(session);
      if (session.expiration) {
        this.scheduleTokenRefresh(session.expiration);
      }
    } catch {
      /* datos corruptos: se ignora */
    }
  }

  // Cierre SOLO local (sin llamar al servidor): para pestañas que reciben el aviso de cierre de
  // otra pestaña, o cuando el cierre global ya se ejecutó en otro lado. Idempotente.
  logoutLocal() {
    this.clearRefreshTimer();
    localStorage.removeItem('contask_session');
    if (this.currentUser() !== null) {
      this.currentUser.set(null);
    }
    this.router.navigate(['/login']);
  }
}