import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { PosHibridoConfigService } from '../pos-hibrido/pos-hibrido-config.service';
import { ConsolidacionResultDto, ReciboPendienteDto } from '../../../core/models/facturacion.models';

/**
 * Cierre de Recibos - POS Híbrido Fase 2. Solo admin (el backend rechaza con 403 si no lo es).
 * Agrupa recibos pendientes (FAC aplicadas, sin emitir, EsRecibo=1) en una sola factura consolidada.
 * Granularidad libre: el admin decide qué combina (fecha, rubro, cliente, lo que necesite).
 */
@Component({
  selector: 'app-cierre-recibos',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './cierre-recibos.html',
  styleUrls: ['./cierre-recibos.scss']
})
export class CierreRecibosComponent {
  private svc = inject(PosHibridoConfigService);

  cargando = signal(false);
  sinPermiso = signal(false);
  procesando = signal(false);
  mensaje = signal<{ tipo: 'error' | 'ok'; texto: string } | null>(null);

  fechaDesde = signal<string>(this.hoy());
  fechaHasta = signal<string>(this.hoy());

  pendientes = signal<ReciboPendienteDto[]>([]);
  seleccionados = signal<Set<number>>(new Set());

  consolidado = signal<ConsolidacionResultDto | null>(null);

  totalSeleccionado = computed(() =>
    this.pendientes().filter((r) => this.seleccionados().has(r.idFactura)).reduce((acc, r) => acc + (Number(r.total) || 0), 0)
  );
  haySeleccion = computed(() => this.seleccionados().size > 0);

  constructor() {
    this.buscar();
  }

  private hoy(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  buscar(): void {
    this.cargando.set(true);
    this.mensaje.set(null);
    this.svc.getRecibosPendientes(this.fechaDesde(), this.fechaHasta())
      .pipe(finalize(() => this.cargando.set(false)))
      .subscribe({
        next: (rows) => {
          this.pendientes.set(rows ?? []);
          this.seleccionados.set(new Set((rows ?? []).map((r) => r.idFactura))); // todos marcados por defecto
        },
        error: (err) => {
          if (err?.status === 403) this.sinPermiso.set(true);
          this.mensaje.set({ tipo: 'error', texto: this.errorTexto(err) });
        }
      });
  }

  toggleSeleccion(idFactura: number): void {
    this.seleccionados.update((set) => {
      const nuevo = new Set(set);
      if (nuevo.has(idFactura)) nuevo.delete(idFactura); else nuevo.add(idFactura);
      return nuevo;
    });
  }

  marcarTodos(valor: boolean): void {
    this.seleccionados.set(valor ? new Set(this.pendientes().map((r) => r.idFactura)) : new Set());
  }

  armarConsolidacion(): void {
    const ids = Array.from(this.seleccionados());
    if (!ids.length || this.procesando()) return;
    this.procesando.set(true);
    this.mensaje.set(null);
    this.svc.armarConsolidacion(ids)
      .pipe(finalize(() => this.procesando.set(false)))
      .subscribe({
        next: (res) => { this.consolidado.set(res); this.mensaje.set({ tipo: 'ok', texto: 'Consolidación armada. Revise antes de aplicar.' }); },
        error: (err) => this.mensaje.set({ tipo: 'error', texto: this.errorTexto(err) })
      });
  }

  quitarOrigen(idOrigen: number): void {
    const c = this.consolidado();
    if (!c || this.procesando()) return;
    this.procesando.set(true);
    this.mensaje.set(null);
    this.svc.quitarDeConsolidacion(c.idFacturaConsolidada, idOrigen)
      .pipe(finalize(() => this.procesando.set(false)))
      .subscribe({
        next: () => {
          const restantes = c.origenes.filter((o) => o.idFactura !== idOrigen);
          if (!restantes.length) {
            this.consolidado.set(null);
            this.mensaje.set({ tipo: 'ok', texto: 'Se quitaron todos los recibos; la consolidación quedó vacía.' });
            this.buscar();
            return;
          }
          this.consolidado.set({ ...c, origenes: restantes });
          this.mensaje.set({ tipo: 'ok', texto: 'Recibo retirado de la consolidación.' });
        },
        error: (err) => this.mensaje.set({ tipo: 'error', texto: this.errorTexto(err) })
      });
  }

  cancelarConsolidacion(): void {
    const c = this.consolidado();
    if (!c || this.procesando()) return;
    this.procesando.set(true);
    this.mensaje.set(null);
    this.svc.cancelarConsolidacion(c.idFacturaConsolidada)
      .pipe(finalize(() => this.procesando.set(false)))
      .subscribe({
        next: () => { this.consolidado.set(null); this.mensaje.set({ tipo: 'ok', texto: 'Consolidación cancelada.' }); this.buscar(); },
        error: (err) => this.mensaje.set({ tipo: 'error', texto: this.errorTexto(err) })
      });
  }

  aplicarConsolidacion(): void {
    const c = this.consolidado();
    if (!c || this.procesando()) return;
    this.procesando.set(true);
    this.mensaje.set(null);
    this.svc.aplicarConsolidacion(c.idFacturaConsolidada)
      .pipe(finalize(() => this.procesando.set(false)))
      .subscribe({
        next: () => this.mensaje.set({
          tipo: 'ok',
          texto: `Factura consolidada aplicada (Prefijo ${c.prefijo} / ${c.factura}). Búsquela en Facturación (FAC) para emitir el DTE.`
        }),
        error: (err) => this.mensaje.set({ tipo: 'error', texto: this.errorTexto(err) })
      });
  }

  nuevaConsolidacion(): void {
    this.consolidado.set(null);
    this.buscar();
  }

  private errorTexto(err: unknown): string {
    const e = err as { error?: { message?: string }; status?: number } | undefined;
    if (e?.status === 403) return 'Solo un administrador puede consolidar recibos.';
    return e?.error?.message ?? 'Ocurrió un error inesperado.';
  }
}
