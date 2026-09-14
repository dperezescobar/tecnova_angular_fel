import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { MessageModule } from 'primeng/message';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';

import { PosHibridoConfigService } from '../pos-hibrido/pos-hibrido-config.service';
import { ConsolidacionResultDto, ReciboPendienteDto } from '../../../core/models/facturacion.models';

export interface PuntoVentaFilterOption {
  label: string;
  value: string; // formato "SUCURSAL|PUNTO_VENTA" o "" para todos
  sucursal: string;
  puntoVenta: string;
  descripcion?: string;
}

/**
 * Cierre de Recibos - POS Híbrido Fase 2. Solo administradores.
 * Agrupa recibos pendientes en una sola factura consolidada DTE.
 * REGLA ESTRICTA: NO ES POSIBLE MEZCLAR PUNTOS DE VENTA (1 consolidación = 1 punto de venta).
 */
@Component({
  selector: 'app-cierre-recibos',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    ButtonModule,
    SelectModule,
    CardModule,
    TagModule,
    ProgressSpinnerModule,
    ToastModule,
    TooltipModule,
    MessageModule,
    ConfirmDialogModule
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './cierre-recibos.html',
  styleUrls: ['./cierre-recibos.scss']
})
export class CierreRecibosComponent implements OnInit {
  private svc = inject(PosHibridoConfigService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);

  // Estados de carga y permisos
  cargando = signal(false);
  cargandoPuntos = signal(false);
  sinPermiso = signal(false);
  procesando = signal(false);

  // Filtros
  fechaDesde = signal<string>(this.hoy());
  fechaHasta = signal<string>(this.hoy());
  puntoVentaFiltro = signal<string>(''); // "" = todos

  // Catálogos y datos
  puntosVentaCatalogo = signal<PuntoVentaFilterOption[]>([]);
  pendientes = signal<ReciboPendienteDto[]>([]);
  seleccionados = signal<Set<number>>(new Set());

  // Estado consolidación en borrador
  consolidado = signal<ConsolidacionResultDto | null>(null);

  // Opciones combinadas para el selector de punto de venta
  opcionesPuntosVenta = computed<PuntoVentaFilterOption[]>(() => {
    const defaultOption: PuntoVentaFilterOption = {
      label: 'Todos los puntos de venta',
      value: '',
      sucursal: '',
      puntoVenta: ''
    };

    const map = new Map<string, PuntoVentaFilterOption>();

    // 1. Agregar del catálogo backend
    for (const p of this.puntosVentaCatalogo()) {
      const key = `${p.sucursal}|${p.puntoVenta}`;
      if (!map.has(key)) {
        map.set(key, p);
      }
    }

    // 2. Agregar puntos de venta presentes en los recibos pendientes actuales
    for (const r of this.pendientes()) {
      const key = `${r.sucursal}|${r.puntoVenta}`;
      if (!map.has(key)) {
        map.set(key, {
          label: `[${r.sucursal}] ${r.puntoVenta}`,
          value: key,
          sucursal: r.sucursal,
          puntoVenta: r.puntoVenta,
          descripcion: r.puntoVenta
        });
      }
    }

    const ordenados = Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
    return [defaultOption, ...ordenados];
  });

  // Conjunto de puntos de venta presentes en los recibos pendientes
  puntosVentaEnPendientes = computed(() => {
    const set = new Set<string>();
    for (const r of this.pendientes()) {
      set.add(`${r.sucursal}|${r.puntoVenta}`);
    }
    return set;
  });

  // Indica si en los resultados actuales hay más de un punto de venta
  hayMultiplesPuntosVenta = computed(() => this.puntosVentaEnPendientes().size > 1);

  // Detecta a qué punto de venta pertenecen los recibos seleccionados actualmente
  puntoVentaActivo = computed<{ sucursal: string; puntoVenta: string; key: string } | null>(() => {
    const sel = this.seleccionados();
    if (sel.size === 0) return null;

    const primerRecibo = this.pendientes().find((r) => sel.has(r.idFactura));
    if (!primerRecibo) return null;

    return {
      sucursal: primerRecibo.sucursal,
      puntoVenta: primerRecibo.puntoVenta,
      key: `${primerRecibo.sucursal}|${primerRecibo.puntoVenta}`
    };
  });

  // Validador estricto: ¿hay mezcla accidental de puntos de venta en los seleccionados?
  hayMezclaPuntosVenta = computed<boolean>(() => {
    const sel = this.seleccionados();
    if (sel.size <= 1) return false;

    const pvs = new Set<string>();
    for (const r of this.pendientes()) {
      if (sel.has(r.idFactura)) {
        pvs.add(`${r.sucursal}|${r.puntoVenta}`);
        if (pvs.size > 1) return true;
      }
    }
    return false;
  });

  // Métricas de resumen
  totalPendientesCount = computed(() => this.pendientes().length);
  totalPendientesMonto = computed(() =>
    this.pendientes().reduce((acc, r) => acc + (Number(r.total) || 0), 0)
  );

  totalSeleccionadosCount = computed(() => this.seleccionados().size);
  totalSeleccionadoMonto = computed(() =>
    this.pendientes()
      .filter((r) => this.seleccionados().has(r.idFactura))
      .reduce((acc, r) => acc + (Number(r.total) || 0), 0)
  );

  haySeleccion = computed(() => this.seleccionados().size > 0);

  canArmarConsolidacion = computed(
    () => this.haySeleccion() && !this.hayMezclaPuntosVenta() && !this.procesando()
  );

  ngOnInit(): void {
    this.cargarPuntosVenta();
    this.buscar();
  }

  private hoy(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  cargarPuntosVenta(): void {
    this.cargandoPuntos.set(true);
    this.svc
      .getPuntosVenta()
      .pipe(finalize(() => this.cargandoPuntos.set(false)))
      .subscribe({
        next: (rows) => {
          if (rows && rows.length) {
            const list: PuntoVentaFilterOption[] = rows.map((r) => ({
              label: `[${r.sucursal}] ${r.puntoVenta} - ${r.puntoVentaDescripcion || r.sucursalDescripcion || ''}`.trim(),
              value: `${r.sucursal}|${r.puntoVenta}`,
              sucursal: r.sucursal,
              puntoVenta: r.puntoVenta,
              descripcion: r.puntoVentaDescripcion
            }));
            this.puntosVentaCatalogo.set(list);
          }
        },
        error: () => {
          // Si el endpoint aún no está disponible, se llenará con los datos de recibos
        }
      });
  }

  buscar(): void {
    this.cargando.set(true);
    this.seleccionados.set(new Set());

    let sucursalParam: string | undefined = undefined;
    let puntoVentaParam: string | undefined = undefined;

    const pvFiltro = this.puntoVentaFiltro();
    if (pvFiltro && pvFiltro.includes('|')) {
      const parts = pvFiltro.split('|');
      sucursalParam = parts[0];
      puntoVentaParam = parts[1];
    }

    this.svc
      .getRecibosPendientes(this.fechaDesde(), this.fechaHasta(), sucursalParam, puntoVentaParam)
      .pipe(finalize(() => this.cargando.set(false)))
      .subscribe({
        next: (rows) => {
          const list = rows ?? [];
          this.pendientes.set(list);

          // Si se filtró por un punto de venta específico, o todos los recibos devueltos son del mismo PV,
          // seleccionamos todos por comodidad.
          if (list.length > 0) {
            const distinctPVs = new Set(list.map((r) => `${r.sucursal}|${r.puntoVenta}`));
            if (distinctPVs.size === 1) {
              this.seleccionados.set(new Set(list.map((r) => r.idFactura)));
            } else {
              // Si hay varios puntos de venta en pantalla, dejamos sin seleccionar para que el usuario
              // escoja conscientemente qué punto de venta desea consolidar sin mezclarlos.
              this.seleccionados.set(new Set());
            }
          }
        },
        error: (err) => {
          if (err?.status === 403) {
            this.sinPermiso.set(true);
          }
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: this.errorTexto(err)
          });
        }
      });
  }

  limpiarFiltros(): void {
    this.fechaDesde.set(this.hoy());
    this.fechaHasta.set(this.hoy());
    this.puntoVentaFiltro.set('');
    this.buscar();
  }

  // Comprueba si una fila puede ser seleccionada o debe estar deshabilitada por no coincidir el PV
  esFilaSeleccionable(r: ReciboPendienteDto): boolean {
    const activo = this.puntoVentaActivo();
    if (!activo) return true; // Nada seleccionado aún, cualquiera puede iniciar la consolidación
    return `${r.sucursal}|${r.puntoVenta}` === activo.key;
  }

  getMotivoBloqueo(r: ReciboPendienteDto): string {
    const activo = this.puntoVentaActivo();
    if (!activo || this.esFilaSeleccionable(r)) return '';
    return `Punto de venta restringido: pertenece a [${r.sucursal}] ${r.puntoVenta}. Solo se puede consolidar ventas de [${activo.sucursal}] ${activo.puntoVenta}.`;
  }

  toggleSeleccion(r: ReciboPendienteDto): void {
    const id = r.idFactura;
    const current = this.seleccionados();

    if (current.has(id)) {
      this.seleccionados.update((set) => {
        const nuevo = new Set(set);
        nuevo.delete(id);
        return nuevo;
      });
      return;
    }

    // Si va a seleccionar, verificar regla de punto de venta único
    const activo = this.puntoVentaActivo();
    const rowKey = `${r.sucursal}|${r.puntoVenta}`;

    if (activo && activo.key !== rowKey) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Punto de venta no coincidente',
        detail: `No se pueden mezclar puntos de venta. Desmarque los recibos actuales de [${activo.sucursal}] ${activo.puntoVenta} para seleccionar los de este punto de venta.`
      });
      return;
    }

    this.seleccionados.update((set) => {
      const nuevo = new Set(set);
      nuevo.add(id);
      return nuevo;
    });
  }

  // Marcar todos los recibos del punto de venta correspondiente
  marcarTodos(): void {
    const list = this.pendientes();
    if (!list.length) return;

    // Caso 1: Hay un filtro específico aplicado o todos pertenecen al mismo PV
    const distinctPVs = Array.from(new Set(list.map((r) => `${r.sucursal}|${r.puntoVenta}`)));
    if (distinctPVs.length === 1) {
      this.seleccionados.set(new Set(list.map((r) => r.idFactura)));
      return;
    }

    // Caso 2: Hay múltiples PVs pero ya hay un PV activo
    const activo = this.puntoVentaActivo();
    if (activo) {
      const idsDelActivo = list
        .filter((r) => `${r.sucursal}|${r.puntoVenta}` === activo.key)
        .map((r) => r.idFactura);
      this.seleccionados.set(new Set(idsDelActivo));
      this.messageService.add({
        severity: 'info',
        summary: 'Selección aplicada',
        detail: `Se marcaron todos los recibos de [${activo.sucursal}] ${activo.puntoVenta}.`
      });
      return;
    }

    // Caso 3: Múltiples PVs y nada seleccionado: seleccionamos el primer PV
    const primerPV = distinctPVs[0];
    const idsDelPrimero = list
      .filter((r) => `${r.sucursal}|${r.puntoVenta}` === primerPV)
      .map((r) => r.idFactura);

    this.seleccionados.set(new Set(idsDelPrimero));
    const [suc, pv] = primerPV.split('|');
    this.messageService.add({
      severity: 'info',
      summary: 'Selección por punto de venta',
      detail: `Se marcaron los recibos de [${suc}] ${pv}. Por regla fiscal, no es posible consolidar múltiples puntos de venta en una misma factura.`
    });
  }

  desmarcarTodos(): void {
    this.seleccionados.set(new Set());
  }

  armarConsolidacion(): void {
    const ids = Array.from(this.seleccionados());
    if (!ids.length || this.procesando()) return;

    if (this.hayMezclaPuntosVenta()) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error de validación',
        detail: 'No es posible consolidar recibos de distintos puntos de venta. Por favor, asegúrese de seleccionar un solo punto de venta.'
      });
      return;
    }

    const activo = this.puntoVentaActivo();
    const pvNombre = activo ? `[${activo.sucursal}] ${activo.puntoVenta}` : '';

    this.confirmationService.confirm({
      header: 'Confirmar consolidación',
      message: `¿Desea armar la consolidación de ${ids.length} recibos por un total de $${this.totalSeleccionadoMonto().toFixed(2)} para el punto de venta ${pvNombre}?`,
      icon: 'pi pi-question-circle',
      acceptLabel: 'Sí, armar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-primary',
      rejectButtonStyleClass: 'p-button-outlined p-button-secondary',
      accept: () => {
        this.procesando.set(true);
        this.svc
          .armarConsolidacion(ids)
          .pipe(finalize(() => this.procesando.set(false)))
          .subscribe({
            next: (res) => {
              this.consolidado.set(res);
              this.messageService.add({
                severity: 'success',
                summary: 'Consolidación armada',
                detail: 'El borrador de consolidación ha sido generado. Revíselo antes de aplicar.'
              });
            },
            error: (err) => {
              this.messageService.add({
                severity: 'error',
                summary: 'Error al consolidar',
                detail: this.errorTexto(err)
              });
            }
          });
      }
    });
  }

  quitarOrigen(idOrigen: number): void {
    const c = this.consolidado();
    if (!c || this.procesando()) return;

    this.confirmationService.confirm({
      header: 'Quitar recibo',
      message: '¿Está seguro de retirar este recibo de la consolidación?',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Quitar',
      rejectLabel: 'Conservar',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-outlined p-button-secondary',
      accept: () => {
        this.procesando.set(true);
        this.svc
          .quitarDeConsolidacion(c.idFacturaConsolidada, idOrigen)
          .pipe(finalize(() => this.procesando.set(false)))
          .subscribe({
            next: () => {
              const restantes = c.origenes.filter((o) => o.idFactura !== idOrigen);
              if (!restantes.length) {
                this.consolidado.set(null);
                this.messageService.add({
                  severity: 'warn',
                  summary: 'Consolidación vacía',
                  detail: 'Se retiraron todos los recibos. La consolidación quedó sin ítems.'
                });
                this.buscar();
                return;
              }
              this.consolidado.set({ ...c, origenes: restantes });
              this.messageService.add({
                severity: 'success',
                summary: 'Recibo retirado',
                detail: 'El recibo ha sido excluido de la consolidación.'
              });
            },
            error: (err) => {
              this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: this.errorTexto(err)
              });
            }
          });
      }
    });
  }

  cancelarConsolidacion(): void {
    const c = this.consolidado();
    if (!c || this.procesando()) return;

    this.confirmationService.confirm({
      header: 'Cancelar consolidación',
      message: '¿Está seguro de cancelar este borrador de consolidación? Los recibos volverán a quedar pendientes para futuras consolidaciones.',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sí, cancelar',
      rejectLabel: 'Regresar',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-outlined p-button-secondary',
      accept: () => {
        this.procesando.set(true);
        this.svc
          .cancelarConsolidacion(c.idFacturaConsolidada)
          .pipe(finalize(() => this.procesando.set(false)))
          .subscribe({
            next: () => {
              this.consolidado.set(null);
              this.messageService.add({
                severity: 'info',
                summary: 'Consolidación cancelada',
                detail: 'El borrador se ha eliminado correctamente.'
              });
              this.buscar();
            },
            error: (err) => {
              this.messageService.add({
                severity: 'error',
                summary: 'Error al cancelar',
                detail: this.errorTexto(err)
              });
            }
          });
      }
    });
  }

  aplicarConsolidacion(): void {
    const c = this.consolidado();
    if (!c || this.procesando()) return;

    this.confirmationService.confirm({
      header: 'Aplicar Factura Consolidada',
      message: `¿Desea aplicar y generar la factura definitiva (${c.prefijo} / ${c.factura}) por $${Number(c.total).toFixed(2)}? Una vez aplicada, podrá emitir el DTE desde Facturación (FAC).`,
      icon: 'pi pi-check-circle',
      acceptLabel: 'Sí, aplicar',
      rejectLabel: 'Revisar más',
      acceptButtonStyleClass: 'p-button-success',
      rejectButtonStyleClass: 'p-button-outlined p-button-secondary',
      accept: () => {
        this.procesando.set(true);
        this.svc
          .aplicarConsolidacion(c.idFacturaConsolidada)
          .pipe(finalize(() => this.procesando.set(false)))
          .subscribe({
            next: () => {
              this.messageService.add({
                severity: 'success',
                summary: 'Factura consolidada aplicada con éxito',
                detail: `Factura ${c.prefijo} / ${c.factura} lista para emisión DTE en módulo de Facturación.`,
                life: 8000
              });
              this.consolidado.set(null);
              this.buscar();
            },
            error: (err) => {
              this.messageService.add({
                severity: 'error',
                summary: 'Error al aplicar',
                detail: this.errorTexto(err)
              });
            }
          });
      }
    });
  }

  nuevaConsolidacion(): void {
    this.consolidado.set(null);
    this.buscar();
  }

  private errorTexto(err: unknown): string {
    const e = err as { error?: { message?: string }; status?: number } | undefined;
    if (e?.status === 403) return 'Solo un administrador puede gestionar la consolidación de recibos.';
    return e?.error?.message ?? 'Ocurrió un error inesperado en el servidor.';
  }
}
