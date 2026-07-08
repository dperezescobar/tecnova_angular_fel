import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';

import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';

import { RepMovimientosService, MovimientoArticuloDto } from './rep-movimientos.service';

interface SelectOption {
  label: string;
  value: string | null;
}

@Component({
  selector: 'app-rep-movimientos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    SelectModule,
    TableModule,
    ProgressSpinnerModule,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './rep-movimientos.html',
  styleUrl: './rep-movimientos.scss',
})
export class RepMovimientosComponent implements OnInit {
  private svc = inject(RepMovimientosService);
  private toast = inject(MessageService);

  articuloSeleccionado = signal<string | null>(null);
  fechaDesde = signal<string>('');
  fechaHasta = signal<string>('');

  articulos = signal<SelectOption[]>([]);

  resultados = signal<MovimientoArticuloDto[]>([]);
  loading = signal(false);
  cargandoCatalogos = signal(true);
  hasBuscado = signal(false);

  totalMovimientos = computed(() => this.resultados().length);
  totalIngresos = computed(() =>
    this.resultados().filter(r => r.movimiento === 'I').reduce((acc, r) => acc + r.cantidad, 0)
  );
  totalSalidas = computed(() =>
    this.resultados().filter(r => r.movimiento === 'S').reduce((acc, r) => acc + r.cantidad, 0)
  );

  ngOnInit(): void {
    this.svc.getArticulos().subscribe({
      next: (articulos) => {
        this.articulos.set(
          (articulos ?? []).map(a => ({ label: `${a.articulo} — ${a.descripcion}`, value: a.articulo }))
        );
        this.cargandoCatalogos.set(false);
      },
      error: () => {
        this.cargandoCatalogos.set(false);
        this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el catálogo de artículos.' });
      },
    });
  }

  generarReporte(): void {
    const articulo = this.articuloSeleccionado();
    if (!articulo) {
      this.toast.add({ severity: 'warn', summary: 'Requerido', detail: 'Selecciona un artículo.' });
      return;
    }
    this.loading.set(true);
    this.hasBuscado.set(true);
    this.svc.generarReporte({
      articulo,
      fechaDesde: this.fechaDesde() || null,
      fechaHasta: this.fechaHasta() || null,
      bodega: null,
    }).pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: data => this.resultados.set(data),
        error: () => this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo generar el reporte.' }),
      });
  }

  limpiar(): void {
    this.articuloSeleccionado.set(null);
    this.fechaDesde.set('');
    this.fechaHasta.set('');
    this.resultados.set([]);
    this.hasBuscado.set(false);
  }

  tipoLabel(mov: string): string {
    return mov === 'I' ? 'Ingreso' : 'Salida';
  }
}
