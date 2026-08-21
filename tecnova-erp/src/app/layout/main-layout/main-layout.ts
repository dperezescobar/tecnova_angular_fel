import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth';
import { PwaInstallService } from '../../core/services/pwa-install';
import { NotificacionesService } from '../../core/services/notificaciones.service';
import { DtePendientesService, DtePendienteItem } from '../../core/services/dte-pendientes.service';
import { FacturacionService } from '../../features/facturacion/services/facturacion';
import { SessionActivityService } from '../../core/services/session-activity';
import { SessionTimeoutDialogComponent } from '../../shared/components/session-timeout-dialog/session-timeout-dialog';
import { MenuService } from '../../core/services/menu.service';
import { APP_VERSION, APP_BUILD_DATE } from '../../../environments/version';

import { HttpClient } from '@angular/common/http';
import { PosSignalRService, SolicitudAjustePendiente } from '../../core/services/pos-signalr.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-main-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:resize)': 'onWindowResize()',
    '(window:orientationchange)': 'onWindowResize()'
  },
  imports: [CommonModule, RouterModule, NgOptimizedImage, SessionTimeoutDialogComponent],
  templateUrl: './main-layout.html',
  styleUrls: ['./main-layout.scss']
})
export class MainLayoutComponent {
  private authService = inject(AuthService);
  private router = inject(Router);
  private pwaInstallService = inject(PwaInstallService);
  private notificacionesService = inject(NotificacionesService);
  public dtePendientesService = inject(DtePendientesService);
  private facturacionService = inject(FacturacionService);
  private sessionActivity = inject(SessionActivityService);
  private menuService = inject(MenuService);
  private http = inject(HttpClient);
  public posSignalR = inject(PosSignalRService);

  solicitudPendienteManager = signal<SolicitudAjustePendiente | null>(null);
  listaSolicitudesPendientes = signal<SolicitudAjustePendiente[]>([]);
  procesandoRespuestaManager = signal<boolean>(false);
  showManagerDrawer = signal<boolean>(false);
  rolesUsuario = signal<string[]>([]);
  private readonly mobileBreakpointQuery = '(max-width: 991.98px)';
  private readonly touchTabletQuery = '(pointer: coarse) and (max-width: 1366px)';

  readonly appVersion = APP_VERSION;
  readonly appBuildDate = APP_BUILD_DATE;
  isSidebarCollapsed = true;
  isDesktopSidebarExpanded = false;
  isMobileView = typeof window !== 'undefined' ? this.detectOverlaySidebarMode(window) : false;
  isMobileMenuOpen = false;
  aplicaInventarios = signal(false);

  showCatalogos = false;
  showInventarios = false;
  showInvReportes = false;
  showFacturacion = false;
  showReportes = false;
  showCompras = false;
  showInstallBanner = () => this.pwaInstallService.canShowInstallBanner();

  showDteDrawer = signal(false);
  tienePendientes = this.notificacionesService.tienePendientes;
  totalDtePendientes = this.dtePendientesService.totalPendientes;
  listaDtePendientes = this.dtePendientesService.pendientes;
  loadingDtePendientes = this.dtePendientesService.loading;
  esEmisorDte = this.dtePendientesService.esEmisorDte;

  constructor() {
    if (typeof window !== 'undefined') {
      requestAnimationFrame(() => this.onWindowResize());
    }
    // Guardián de sesión por inactividad (idempotente; solo actúa si hay sesión activa).
    this.sessionActivity.start();
    effect(() => {
      const user = this.authService.currentUser();
      const idEmpresa = user?.selectedEmpresa?.idEmpresa ?? 0;
      if (idEmpresa && !this.notificacionesService.yaVerificado()) {
        this.notificacionesService.verificarAbonos(idEmpresa);
      }
      if (idEmpresa) {
        this.dtePendientesService.cargarPendientes();
        this.facturacionService.getAplicaInventarios().subscribe(v => this.aplicaInventarios.set(v));
        this.menuService.cargarEfectivo(idEmpresa);

        const username = user?.username || '';
        if (username) {
          this.http.get<string[]>(`${environment.apiUrl}/promociones/mis-roles?usuario=${encodeURIComponent(username)}`)
            .subscribe({
              next: (roles) => {
                this.rolesUsuario.set(roles || []);
                if (this.esManagerPOS()) {
                  this.posSignalR.iniciarConexion(0, true);
                  this.cargarSolicitudesPendientesManager();
                }
              },
              error: () => {
                if (this.esManagerPOS()) {
                  this.posSignalR.iniciarConexion(0, true);
                  this.cargarSolicitudesPendientesManager();
                }
              }
            });
        } else if (this.esManagerPOS()) {
          this.posSignalR.iniciarConexion(0, true);
          this.cargarSolicitudesPendientesManager();
        }
      } else {
        this.aplicaInventarios.set(false);
      }
    });

    effect(() => {
      const sol = this.posSignalR.nuevaSolicitudSignal();
      if (sol && this.esManagerPOS()) {
        this.solicitudPendienteManager.set(sol);
        this.cargarSolicitudesPendientesManager();
      }
    });
  }

  cargarSolicitudesPendientesManager(): void {
    this.http.get<SolicitudAjustePendiente[]>(`${environment.apiUrl}/promociones/solicitudes-pendientes`)
      .subscribe({
        next: (rows) => this.listaSolicitudesPendientes.set(rows ?? []),
        error: () => this.listaSolicitudesPendientes.set([])
      });
  }

  responderSolicitudManager(solicitudID: number, aprobado: boolean): void {
    if (this.procesandoRespuestaManager()) return;
    this.procesandoRespuestaManager.set(true);

    // Ocultar pop-up emergente de forma inmediata para dar feedback instantáneo
    if (this.solicitudPendienteManager()?.solicitudID === solicitudID) {
      this.solicitudPendienteManager.set(null);
    }

    const body = {
      solicitudID,
      aprobado,
      usuarioAprobo: this.currentUser()
    };

    this.http.post(`${environment.apiUrl}/promociones/responder-ajuste`, body)
      .subscribe({
        next: () => {
          this.procesandoRespuestaManager.set(false);
          this.cargarSolicitudesPendientesManager();
        },
        error: () => this.procesandoRespuestaManager.set(false)
      });
  }

  toggleDteDrawer(): void {
    this.showDteDrawer.update(v => !v);
    if (this.showDteDrawer()) {
      this.dtePendientesService.cargarPendientes();
    }
  }

  toggleManagerDrawer(): void {
    this.showManagerDrawer.update(v => !v);
    if (this.showManagerDrawer()) {
      this.cargarSolicitudesPendientesManager();
    }
  }

  irADocumento(item: DtePendienteItem): void {
    this.showDteDrawer.set(false);
    this.router.navigateByUrl(item.routeUrl);
  }
  
  // Signal para obtener el usuario actual reactivamente
  currentUser = () => this.authService.currentUser()?.username || 'Usuario';
  currentEmpresaName = () => {
    const nombre = this.authService.currentUser()?.selectedEmpresa?.nombreComercial ?? '';
    return nombre.trim().toUpperCase();
  };

  currentEmpresaLogo = () => {
    const empresa = this.authService.currentUser()?.selectedEmpresa;
    const base = String(empresa?.urlServicio ?? empresa?.urlApi ?? '').trim();
    if (!base) {
      return '';
    }

    const normalizedBase = base.endsWith('/') ? base : `${base}/`;
    return `${normalizedBase}BackgroundLogo.png`;
  };

  toggleCatalogos() {
    this.showCatalogos = !this.showCatalogos;
  }

  toggleFacturacion() {
    this.showFacturacion = !this.showFacturacion;
  }

  toggleReportes() {
    this.showReportes = !this.showReportes;
  }

  toggleInventarios() {
    this.showInventarios = !this.showInventarios;
  }

  toggleInvReportes() {
    this.showInvReportes = !this.showInvReportes;
  }

  toggleCompras() {
    this.showCompras = !this.showCompras;
  }

  onWindowResize() {
    const wasMobile = this.isMobileView;
    this.isMobileView = this.detectOverlaySidebarMode(window);

    if (wasMobile && !this.isMobileView) {
      this.isMobileMenuOpen = false;
    }

    if (this.isMobileView) {
      this.isDesktopSidebarExpanded = false;
    }
  }

  private detectOverlaySidebarMode(target: Window): boolean {
    return (
      target.matchMedia(this.mobileBreakpointQuery).matches ||
      target.matchMedia(this.touchTabletQuery).matches
    );
  }

  toggleSidebar() {
    if (this.isMobileView) {
      this.isMobileMenuOpen = !this.isMobileMenuOpen;
      return;
    }

    this.isSidebarCollapsed = !this.isSidebarCollapsed;
    this.isDesktopSidebarExpanded = !this.isSidebarCollapsed;
  }

  isSidebarInIconMode(): boolean {
    return !this.isMobileView && this.isSidebarCollapsed && !this.isDesktopSidebarExpanded;
  }

  expandDesktopSidebarTemporarily() {
    if (this.isMobileView || !this.isSidebarCollapsed) {
      return;
    }

    this.isDesktopSidebarExpanded = true;
  }

  collapseDesktopSidebarTemporarily() {
    if (this.isMobileView || !this.isSidebarCollapsed) {
      return;
    }

    this.isDesktopSidebarExpanded = false;
  }

  onSidebarFocusOut(event: FocusEvent) {
    if (this.isMobileView || !this.isSidebarCollapsed) {
      return;
    }

    const currentTarget = event.currentTarget as HTMLElement | null;
    const nextTarget = event.relatedTarget as Node | null;
    if (currentTarget && nextTarget && currentTarget.contains(nextTarget)) {
      return;
    }

    this.isDesktopSidebarExpanded = false;
  }

  onNavLinkClick() {
    if (this.isMobileView) {
      this.isMobileMenuOpen = false;
      return;
    }

    this.collapseDesktopSidebarTemporarily();
  }

  closeSidebarOnMobile() {
    if (this.isMobileView) {
      this.isMobileMenuOpen = false;
    }
  }

  logout() {
    this.closeSidebarOnMobile();
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  async installApp() {
    await this.pwaInstallService.promptInstall();
  }

  dismissInstallBanner() {
    this.pwaInstallService.dismissBanner();
  }
    adminAccess(): boolean {
    const tipoUsuario = String(this.authService.currentUser()?.tipoUsuario ?? '').trim().toUpperCase();
    if (tipoUsuario === 'A') return true;
    return false;
  }

  esRoot(): boolean {
    return this.authService.isRoot();
  }

  esManagerPOS(): boolean {
    if (this.adminAccess() || this.esRoot()) return true;
    const roles = (this.rolesUsuario() ?? []).map((r) => String(r ?? '').trim().toUpperCase());
    return roles.some((r) => r.includes('ADMIN') || r.includes('MANAGER') || r.includes('GERENTE') || r === 'ADMINISTRADOR');
  }

  // Filtrado de menú por layout administrado (en modo clásico devuelve true → menú intacto).
  puedeVer(clave: string): boolean {
    return this.menuService.puedeVer(clave);
  }

  grupoVisible(claves: string[]): boolean {
    return this.menuService.grupoVisible(claves);
  }

  irAlPerfil(): void {
    this.router.navigate(['/mi-perfil']);
  }

  abrirNotificaciones(): void {
    this.notificacionesService.marcarVisto();
    this.router.navigate(['/mi-perfil'], { queryParams: { tab: 'historial-pagos' } });
  }
}