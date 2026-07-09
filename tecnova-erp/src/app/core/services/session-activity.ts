import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from './auth';

/**
 * Guardián de sesión por inactividad (modelo de sesión compartida).
 *
 * - F2: mide la actividad del usuario y la comparte entre pestañas vía localStorage.
 * - F3: al volver de una ausencia decide según el tiempo inactivo.
 * - F4: <umbralPanel continúa; entre panel y cierre muestra un panel de 30s; >=cierre cierra.
 * - F5: no cierra por fallos transitorios (solo el interceptor cierra ante rechazo definitivo).
 * - F1: adopta el token que escriba otra pestaña y sincroniza el cierre entre pestañas.
 *
 * Modo prueba: localStorage['contask_sess_test'] === '1' usa umbrales en minutos/segundos.
 */
@Injectable({ providedIn: 'root' })
export class SessionActivityService {
  private auth = inject(AuthService);

  // Señales para el panel de "seguir conectado / cerrar sesión".
  promptVisible = signal(false);
  countdown = signal(0);

  private readonly ACTIVITY_KEY = 'contask_last_activity';
  private started = false;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private throttleUntil = 0;
  private channel: BroadcastChannel | null = null;

  private readonly actividadEvents = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
  private readonly onActivity = () => this.registrarActividad(false);
  private readonly onReturn = () => this.evaluarRetorno();
  private readonly onStorage = (e: StorageEvent) => this.manejarStorage(e);

  private get testMode(): boolean {
    try { return localStorage.getItem('contask_sess_test') === '1'; } catch { return false; }
  }
  private get promptMs(): number { return this.testMode ? 60_000 : 60 * 60_000; }      // 1 min prueba / 1 h real
  private get logoutMs(): number { return this.testMode ? 120_000 : 4 * 60 * 60_000; } // 2 min prueba / 4 h real
  private get countdownMs(): number { return this.testMode ? 15_000 : 30_000; }
  private readonly throttleMs = 15_000;

  start(): void {
    if (this.started || typeof window === 'undefined') {
      return;
    }
    this.started = true;
    this.registrarActividad(true);

    this.actividadEvents.forEach((ev) => window.addEventListener(ev, this.onActivity, { passive: true }));
    document.addEventListener('visibilitychange', this.onReturn);
    window.addEventListener('focus', this.onReturn);
    window.addEventListener('storage', this.onStorage);

    try {
      this.channel = new BroadcastChannel('contask_session');
      this.channel.onmessage = (m) => this.manejarBroadcast(m.data);
    } catch {
      this.channel = null;
    }
  }

  stop(): void {
    if (!this.started) {
      return;
    }
    this.started = false;
    this.actividadEvents.forEach((ev) => window.removeEventListener(ev, this.onActivity));
    document.removeEventListener('visibilitychange', this.onReturn);
    window.removeEventListener('focus', this.onReturn);
    window.removeEventListener('storage', this.onStorage);
    this.limpiarCountdown();
    this.promptVisible.set(false);
    try { this.channel?.close(); } catch { /* noop */ }
    this.channel = null;
  }

  // ── Panel: decisiones del usuario ──────────────────────────────────────────
  continuar(): void {
    this.limpiarCountdown();
    this.promptVisible.set(false);
    this.registrarActividad(true);
    this.auth.resyncSession().subscribe({ error: () => { /* F5: transitorio, no cerrar */ } });
    this.emitir({ type: 'continue' });
  }

  cerrar(): void {
    this.limpiarCountdown();
    this.promptVisible.set(false);
    this.emitir({ type: 'logout' });
    this.auth.logout(); // cierre global (servidor + local)
  }

  // ── Interno ────────────────────────────────────────────────────────────────
  private registrarActividad(forzar: boolean): void {
    if (!forzar && this.promptVisible()) {
      return; // durante el panel la interacción no reinicia la actividad automáticamente
    }
    const ahora = Date.now();
    if (!forzar && ahora < this.throttleUntil) {
      return;
    }
    this.throttleUntil = ahora + this.throttleMs;
    try { localStorage.setItem(this.ACTIVITY_KEY, String(ahora)); } catch { /* noop */ }
  }

  private ultimaActividad(): number {
    try {
      const v = Number(localStorage.getItem(this.ACTIVITY_KEY));
      return Number.isFinite(v) && v > 0 ? v : Date.now();
    } catch {
      return Date.now();
    }
  }

  private evaluarRetorno(): void {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      return;
    }
    if (!this.auth.getAccessToken() || this.promptVisible()) {
      return;
    }
    const inactividad = Date.now() - this.ultimaActividad();
    if (inactividad >= this.logoutMs) {
      this.emitir({ type: 'logout' });
      this.auth.logout();
    } else if (inactividad >= this.promptMs) {
      this.mostrarPanel();
    } else {
      // Actividad reciente: aseguramos token fresco de forma tolerante (F5).
      this.auth.resyncSession().subscribe({ error: () => { /* transitorio */ } });
    }
  }

  private mostrarPanel(): void {
    this.promptVisible.set(true);
    let restante = Math.ceil(this.countdownMs / 1000);
    this.countdown.set(restante);
    this.limpiarCountdown();
    this.countdownTimer = setInterval(() => {
      restante -= 1;
      this.countdown.set(restante);
      if (restante <= 0) {
        this.cerrar(); // sin decisión en el tiempo → cierre
      }
    }, 1000);
  }

  private manejarStorage(e: StorageEvent): void {
    if (e.key !== 'contask_session') {
      return;
    }
    if (e.newValue) {
      this.auth.reloadFromStorage(); // F1: otra pestaña renovó el token → adoptarlo
    } else {
      this.limpiarCountdown();
      this.promptVisible.set(false);
      this.auth.logoutLocal(); // otra pestaña cerró sesión
    }
  }

  private manejarBroadcast(data: { type?: string } | null): void {
    if (!data) {
      return;
    }
    if (data.type === 'logout') {
      this.limpiarCountdown();
      this.promptVisible.set(false);
      this.auth.logoutLocal();
    } else if (data.type === 'continue') {
      this.limpiarCountdown();
      this.promptVisible.set(false);
    }
  }

  private emitir(msg: { type: string }): void {
    try { this.channel?.postMessage(msg); } catch { /* noop */ }
  }

  private limpiarCountdown(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }
}
