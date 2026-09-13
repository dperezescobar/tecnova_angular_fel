import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { finalize } from 'rxjs';

import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ToastModule } from 'primeng/toast';
import { TabsModule } from 'primeng/tabs';
import { MessageService } from 'primeng/api';

import { PerfilService } from './services/perfil.service';
import { AuthService } from '../../core/services/auth';
import { NotificacionesService } from '../../core/services/notificaciones.service';
import { FacturacionService } from '../facturacion/services/facturacion';
import { AbonoEmpresaDto, PerfilEmpresaDto } from '../../core/models/perfil.models';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-mi-perfil',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ButtonModule, CheckboxModule, InputTextModule, ProgressSpinnerModule, ToastModule, TabsModule],
  providers: [MessageService],
  templateUrl: './mi-perfil.html',
  styleUrl: './mi-perfil.scss',
})
export class MiPerfilComponent implements OnInit {
  private perfilService = inject(PerfilService);
  private authService = inject(AuthService);
  private notificacionesService = inject(NotificacionesService);
  private facturacionService = inject(FacturacionService);
  private route = inject(ActivatedRoute);
  private messageService = inject(MessageService);
  private http = inject(HttpClient);

  perfil = signal<PerfilEmpresaDto | null>(null);
  esManagerPOS = signal(false);
  pinPasswordActual = signal('');
  pinNuevo = signal('');
  pinNuevoConfirmar = signal('');
  guardandoPin = signal(false);
  abonos = signal<AbonoEmpresaDto[]>([]);
  loadingPerfil = signal(false);
  loadingAbonos = signal(false);
  loadingConfig = signal(false);
  savingConfig = signal(false);
  minimoGlobalInput = signal(6);
  emiteDteInput = signal(false);
  savingEmiteDte = signal(false);
  aplicaInventarioInput = signal(false);
  validarExistenciaInput = signal(true);
  savingValidarExistencia = signal(false);
  activeTab = signal('mis-datos');

  private get idEmpresa(): number {
    return this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0;
  }

  ngOnInit(): void {
    this.route.queryParams.subscribe((params) => {
      const tab = params['tab'];
      if (tab) {
        this.activeTab.set(tab);
        if (tab === 'historial-pagos') {
          this.notificacionesService.marcarVisto();
        }
      }
    });
    this.loadPerfil();
    this.loadAbonos();
    this.loadMinimoGlobal();
    this.loadEmiteDte();
    this.loadAplicaInventario();
    this.loadValidarExistencia();
    this.loadRoles();
  }

  private loadRoles(): void {
    const username = this.authService.currentUser()?.username || '';
    if (!username) return;
    this.http.get<string[]>(`${environment.apiUrl}/promociones/mis-roles?usuario=${encodeURIComponent(username)}`)
      .subscribe({
        next: (roles) => this.esManagerPOS.set((roles || []).includes('MANAGER_POS') || (roles || []).includes('ADMIN')),
        error: () => this.esManagerPOS.set(false)
      });
  }

  guardarPin(): void {
    if (this.guardandoPin()) return;

    const pin = this.pinNuevo().trim();
    if (!/^\d{4,6}$/.test(pin)) {
      this.messageService.add({ severity: 'error', summary: 'PIN de autorización', detail: 'El PIN debe ser numérico, de 4 a 6 dígitos.' });
      return;
    }
    if (pin !== this.pinNuevoConfirmar().trim()) {
      this.messageService.add({ severity: 'error', summary: 'PIN de autorización', detail: 'Los PIN ingresados no coinciden.' });
      return;
    }
    if (!this.pinPasswordActual()) {
      this.messageService.add({ severity: 'error', summary: 'PIN de autorización', detail: 'Debe confirmar su contraseña actual.' });
      return;
    }

    this.guardandoPin.set(true);
    this.http.post(`${environment.apiUrl}/promociones/mi-pin`, {
      passwordActual: this.pinPasswordActual(),
      pinNuevo: pin
    }).pipe(finalize(() => this.guardandoPin.set(false)))
      .subscribe({
        next: () => {
          this.pinPasswordActual.set('');
          this.pinNuevo.set('');
          this.pinNuevoConfirmar.set('');
          this.messageService.add({ severity: 'success', summary: 'PIN de autorización', detail: 'PIN configurado correctamente.' });
        },
        error: (err) => {
          const detail = err?.error?.message || 'No se pudo guardar el PIN.';
          this.messageService.add({ severity: 'error', summary: 'PIN de autorización', detail });
        }
      });
  }

  esRoot(): boolean {
    return this.authService.isRoot();
  }

  onTabChange(value: string | number | undefined): void {
    const tab = String(value ?? '');
    if (!tab) { return; }
    this.activeTab.set(tab);
    if (tab === 'historial-pagos') {
      this.notificacionesService.marcarVisto();
    }
  }

  loadPerfil(): void {
    const id = this.idEmpresa;
    if (!id) { return; }
    this.loadingPerfil.set(true);
    this.perfilService.getPerfilEmpresa(id).pipe(
      finalize(() => this.loadingPerfil.set(false))
    ).subscribe({
      next: (data) => this.perfil.set(data),
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Mi perfil',
          detail: 'No se pudo cargar el perfil de la empresa.',
        });
      },
    });
  }

  loadAbonos(): void {
    const id = this.idEmpresa;
    if (!id) { return; }
    this.loadingAbonos.set(true);
    this.perfilService.getAbonosEmpresa(id).pipe(
      finalize(() => this.loadingAbonos.set(false))
    ).subscribe({
      next: (data) => this.abonos.set(data),
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Mi perfil',
          detail: 'No se pudo cargar el historial de pagos.',
        });
      },
    });
  }

  estadoBadgeClass(estado: string): string {
    const s = (estado ?? '').toLowerCase().trim();
    if (s === 'pagado' || s === 'completado' || s === 'aprobado') return 'ok';
    if (s === 'pendiente') return 'warn';
    if (s === 'rechazado' || s === 'anulado' || s === 'cancelado') return 'danger';
    return 'secondary';
  }

  empresaInicial(): string {
    const nombre = this.perfil()?.nombreComercial || this.perfil()?.nombre || '';
    return nombre.trim().charAt(0).toUpperCase() || '?';
  }

  totalAbonado(): number {
    return this.abonos()
      .filter(a => {
        const s = (a.estado ?? '').toLowerCase().trim();
        return s === 'pagado' || s === 'completado' || s === 'aprobado';
      })
      .reduce((acc, a) => acc + (a.monto ?? 0), 0);
  }

  abonosPendientes(): number {
    return this.abonos().filter(a => (a.estado ?? '').toLowerCase().trim() === 'pendiente').length;
  }

  reload(): void {
    this.loadPerfil();
    this.loadAbonos();
  }

  loadMinimoGlobal(): void {
    this.loadingConfig.set(true);
    this.facturacionService.getMinimoGlobalMayoreo().pipe(
      finalize(() => this.loadingConfig.set(false))
    ).subscribe({
      next: (minimo) => this.minimoGlobalInput.set(minimo),
      error: () => {}
    });
  }

  saveMinimoGlobal(): void {
    const minimo = this.minimoGlobalInput();
    if (minimo < 0) return;
    this.savingConfig.set(true);
    this.facturacionService.setMinimoGlobalMayoreo(minimo).pipe(
      finalize(() => this.savingConfig.set(false))
    ).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Configuración', detail: 'Mínimo global mayoreo guardado.' });
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Configuración', detail: 'No se pudo guardar la configuración.' });
      }
    });
  }

  loadEmiteDte(): void {
    this.facturacionService.getEmiteDte().subscribe({
      next: (emite) => this.emiteDteInput.set(emite),
      error: () => {}
    });
  }

  onEmiteDteChange(checked: boolean): void {
    const anterior = this.emiteDteInput();
    this.emiteDteInput.set(checked);
    this.savingEmiteDte.set(true);
    this.facturacionService.setEmiteDte(checked).pipe(
      finalize(() => this.savingEmiteDte.set(false))
    ).subscribe({
      next: () => {
        this.authService.setSelectedEmpresaEmiteDte(checked);
        this.messageService.add({
          severity: 'success',
          summary: 'Configuración',
          detail: `Emisión de DTE ${checked ? 'activada' : 'desactivada'}.`
        });
      },
      error: () => {
        this.emiteDteInput.set(anterior);
        this.messageService.add({ severity: 'error', summary: 'Configuración', detail: 'No se pudo guardar la configuración.' });
      }
    });
  }

  loadAplicaInventario(): void {
    this.facturacionService.getAplicaInventarios().subscribe({
      next: (aplica) => this.aplicaInventarioInput.set(aplica),
      error: () => {}
    });
  }

  loadValidarExistencia(): void {
    this.facturacionService.getValidarExistencia().subscribe({
      next: (validar) => this.validarExistenciaInput.set(validar),
      error: () => {}
    });
  }

  onValidarExistenciaChange(checked: boolean): void {
    const anterior = this.validarExistenciaInput();
    this.validarExistenciaInput.set(checked);
    this.savingValidarExistencia.set(true);
    this.facturacionService.setValidarExistencia(checked).pipe(
      finalize(() => this.savingValidarExistencia.set(false))
    ).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Configuración',
          detail: `Validación de existencia al facturar ${checked ? 'activada' : 'desactivada'}.`
        });
      },
      error: () => {
        this.validarExistenciaInput.set(anterior);
        this.messageService.add({ severity: 'error', summary: 'Configuración', detail: 'No se pudo guardar la configuración.' });
      }
    });
  }
}
