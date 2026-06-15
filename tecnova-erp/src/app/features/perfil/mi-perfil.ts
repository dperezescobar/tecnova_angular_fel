import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { finalize } from 'rxjs';

import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ToastModule } from 'primeng/toast';
import { TabsModule } from 'primeng/tabs';
import { MessageService } from 'primeng/api';

import { PerfilService } from './services/perfil.service';
import { AuthService } from '../../core/services/auth';
import { NotificacionesService } from '../../core/services/notificaciones.service';
import { AbonoEmpresaDto, PerfilEmpresaDto } from '../../core/models/perfil.models';

@Component({
  selector: 'app-mi-perfil',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ButtonModule, ProgressSpinnerModule, ToastModule, TabsModule],
  providers: [MessageService],
  templateUrl: './mi-perfil.html',
  styleUrl: './mi-perfil.scss',
})
export class MiPerfilComponent implements OnInit {
  private perfilService = inject(PerfilService);
  private authService = inject(AuthService);
  private notificacionesService = inject(NotificacionesService);
  private route = inject(ActivatedRoute);
  private messageService = inject(MessageService);

  perfil = signal<PerfilEmpresaDto | null>(null);
  abonos = signal<AbonoEmpresaDto[]>([]);
  loadingPerfil = signal(false);
  loadingAbonos = signal(false);
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
    if (s === 'pagado' || s === 'completado' || s === 'aprobado') return 'estado-success';
    if (s === 'pendiente') return 'estado-warn';
    if (s === 'rechazado' || s === 'anulado' || s === 'cancelado') return 'estado-danger';
    return 'estado-secondary';
  }

  reload(): void {
    this.loadPerfil();
    this.loadAbonos();
  }
}
