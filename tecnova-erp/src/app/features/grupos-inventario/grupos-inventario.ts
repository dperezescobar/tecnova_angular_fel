import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs/operators';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { DialogModule } from 'primeng/dialog';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageModule } from 'primeng/message';
import { CheckboxModule } from 'primeng/checkbox';
import { ToastModule } from 'primeng/toast';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';

import { ArticulosService } from '../articulos/services/articulos';
import {
  GrupoInventarioCompletoDto,
  GrupoInventarioUpdateDto,
  PuntoVentaGrupoItemDto
} from '../../core/models/articulos.models';
import { AuthService } from '../../core/services/auth';

interface NivelOption {
  label: string;
  value: number;
}

@Component({
  selector: 'app-grupos-inventario',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TableModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    DialogModule,
    ProgressSpinnerModule,
    MessageModule,
    CheckboxModule,
    ToastModule,
    TagModule,
    TooltipModule,
    ConfirmDialogModule
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './grupos-inventario.html',
  styleUrls: ['./grupos-inventario.scss']
})
export class GruposInventarioComponent implements OnInit {
  private articulosService = inject(ArticulosService);
  private authService = inject(AuthService);
  private fb = inject(FormBuilder);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);

  // Estados de datos
  grupos = signal<GrupoInventarioCompletoDto[]>([]);
  loading = signal(false);
  saving = signal(false);

  // Filtros
  filterText = signal('');
  selectedNivelFilter = signal<number>(0);

  // Modal de creación / edición
  showDialog = signal(false);
  isEditMode = signal(false);
  puntosVenta = signal<PuntoVentaGrupoItemDto[]>([]);
  loadingPv = signal(false);

  // Opciones de nivel
  readonly nivelFilterOptions: NivelOption[] = [
    { label: 'Todos los niveles', value: 0 },
    { label: 'Nivel 1: Grupos principales', value: 1 },
    { label: 'Nivel 2: Subgrupos', value: 2 }
  ];

  readonly nivelFormOptions: NivelOption[] = [
    { label: 'Nivel 1 — Grupo Principal (gestiona cajas autorizadas)', value: 1 },
    { label: 'Nivel 2 — Subgrupo (hereda cajas del grupo principal)', value: 2 }
  ];

  // Formulario reactivo
  grupoForm = this.fb.group({
    GpoInventario: ['', [Validators.required, Validators.maxLength(20)]],
    Descripcion: ['', [Validators.required, Validators.maxLength(100)]],
    Nivel: [1, [Validators.required]]
  });

  // Lista filtrada reactiva
  filteredGrupos = computed(() => {
    let list = this.grupos();
    const nivel = this.selectedNivelFilter();
    if (nivel > 0) {
      list = list.filter((g) => g.Nivel === nivel);
    }

    const query = this.filterText().trim().toLowerCase();
    if (query) {
      list = list.filter(
        (g) =>
          g.GrupoInventario.toLowerCase().includes(query) ||
          g.Descripcion.toLowerCase().includes(query)
      );
    }

    return list;
  });

  // Resumen de totales
  totalGruposNivel1 = computed(() => this.grupos().filter((g) => g.Nivel === 1).length);
  totalGruposNivel2 = computed(() => this.grupos().filter((g) => g.Nivel === 2).length);

  onNivelFilterChange(value: number): void {
    this.selectedNivelFilter.set(Number(value ?? 0));
  }

  getPuntosVentaList(pvString?: string): string[] {
    if (!pvString || !pvString.trim()) return [];
    return pvString.split(',').map((s) => s.trim()).filter(Boolean);
  }

  ngOnInit(): void {
    this.loadGrupos();
  }

  loadGrupos(): void {
    this.loading.set(true);
    this.articulosService
      .getGruposInventarioCompleto()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (data) => {
          this.grupos.set(data ?? []);
        },
        error: () => {
          this.showError('Error', 'No se pudieron cargar los grupos de inventario.');
        }
      });
  }

  openCreate(): void {
    this.isEditMode.set(false);
    this.grupoForm.reset({
      GpoInventario: '',
      Descripcion: '',
      Nivel: 1
    });
    this.grupoForm.controls.GpoInventario.enable();
    this.grupoForm.controls.Nivel.enable();
    this.loadPuntosVenta('');
    this.showDialog.set(true);
  }

  openEdit(grupo: GrupoInventarioCompletoDto): void {
    this.isEditMode.set(true);
    this.grupoForm.reset({
      GpoInventario: grupo.GrupoInventario,
      Descripcion: grupo.Descripcion,
      Nivel: grupo.Nivel
    });
    this.grupoForm.controls.GpoInventario.disable();
    this.grupoForm.controls.Nivel.disable();

    if (grupo.Nivel === 1) {
      this.loadPuntosVenta(grupo.GrupoInventario);
    } else {
      this.puntosVenta.set([]);
    }

    this.showDialog.set(true);
  }

  onNivelFormChange(nivel: number): void {
    if (nivel === 1) {
      const currentCode = this.grupoForm.controls.GpoInventario.value ?? '';
      this.loadPuntosVenta(currentCode);
    } else {
      this.puntosVenta.set([]);
    }
  }

  private loadPuntosVenta(grupo: string): void {
    this.loadingPv.set(true);
    this.articulosService
      .getPuntosVentaPorGrupo(grupo)
      .pipe(finalize(() => this.loadingPv.set(false)))
      .subscribe({
        next: (data) => {
          this.puntosVenta.set(data ?? []);
        },
        error: () => {
          this.puntosVenta.set([]);
          this.showError('Puntos de venta', 'No se pudieron consultar los puntos de venta.');
        }
      });
  }

  togglePuntoVenta(pv: PuntoVentaGrupoItemDto): void {
    this.puntosVenta.update((list) =>
      list.map((item) =>
        item.Sucursal === pv.Sucursal && item.PuntoVenta === pv.PuntoVenta
          ? { ...item, Asignado: !item.Asignado }
          : item
      )
    );
  }

  setAllPuntosVenta(asignar: boolean): void {
    this.puntosVenta.update((list) =>
      list.map((item) => ({ ...item, Asignado: asignar }))
    );
  }

  saveGrupo(): void {
    if (this.grupoForm.invalid) {
      this.grupoForm.markAllAsTouched();
      return;
    }

    const raw = this.grupoForm.getRawValue();
    const code = String(raw.GpoInventario ?? '').trim().toUpperCase();
    const desc = String(raw.Descripcion ?? '').trim();
    const nivel = Number(raw.Nivel ?? 1);
    const usuario = this.authService.currentUser()?.username ?? 'WEB';
    const isEdit = this.isEditMode();

    if (!code || !desc) {
      this.showError('Validación', 'El código y la descripción son obligatorios.');
      return;
    }

    const payload: GrupoInventarioUpdateDto = {
      GpoInventario: code,
      Descripcion: desc,
      Nivel: nivel,
      Usuario: usuario,
      Modificar: isEdit ? 1 : 0,
      PuntosVenta:
        nivel === 1
          ? this.puntosVenta().map((pv) => ({
              Sucursal: pv.Sucursal,
              PuntoVenta: pv.PuntoVenta,
              Asignado: pv.Asignado
            }))
          : undefined
    };

    this.saving.set(true);
    this.articulosService
      .updateGrupoInventario(payload)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.showSuccess(
            'Éxito',
            isEdit
              ? `Grupo "${code}" actualizado correctamente.`
              : `Grupo "${code}" creado correctamente.`
          );
          this.showDialog.set(false);
          this.loadGrupos();
        },
        error: () => {
          this.showError('Error', 'No se pudo guardar el grupo de inventario. Verifique los datos.');
        }
      });
  }

  confirmDelete(grupo: GrupoInventarioCompletoDto): void {
    const hasArticulos = (grupo.TotalArticulos ?? 0) > 0;
    const warningMsg = hasArticulos
      ? `\n\n⚠️ ¡ATENCIÓN! Este grupo tiene ${grupo.TotalArticulos} artículo(s) vinculado(s). Eliminarlo puede causar inconsistencias.`
      : '';

    this.confirmationService.confirm({
      message: `¿Está seguro de eliminar el grupo "${grupo.GrupoInventario} - ${grupo.Descripcion}"?${warningMsg}`,
      header: 'Confirmar Eliminación',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sí, eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-secondary p-button-text',
      accept: () => {
        this.articulosService
          .deleteGrupoInventario({ GpoInventario: grupo.GrupoInventario })
          .subscribe({
            next: () => {
              this.showSuccess('Eliminado', `Grupo "${grupo.GrupoInventario}" eliminado.`);
              this.loadGrupos();
            },
            error: () => {
              this.showError('Error', `No se pudo eliminar el grupo "${grupo.GrupoInventario}".`);
            }
          });
      }
    });
  }

  closeDialog(): void {
    this.showDialog.set(false);
    this.puntosVenta.set([]);
  }

  private showSuccess(summary: string, detail: string): void {
    this.messageService.add({ severity: 'success', summary, detail, life: 3500 });
  }

  private showError(summary: string, detail: string): void {
    this.messageService.add({ severity: 'error', summary, detail, life: 5000 });
  }
}
