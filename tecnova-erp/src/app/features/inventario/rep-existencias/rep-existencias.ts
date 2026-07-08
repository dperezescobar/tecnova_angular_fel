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

import {
  RepExistenciasService,
  BodegaDto,
  ArticuloSimpleDto,
  ExistenciaDto,
  GrupoDto,
} from './rep-existencias.service';

interface SelectOption {
  label: string;
  value: string | null;
}

@Component({
  selector: 'app-rep-existencias',
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
  templateUrl: './rep-existencias.html',
  styleUrl: './rep-existencias.scss',
})
export class RepExistenciasComponent implements OnInit {
  private svc = inject(RepExistenciasService);
  private toast = inject(MessageService);

  fechaCorte = signal<string>(this.hoy());
  bodegaSeleccionada = signal<string | null>(null);
  articuloSeleccionado = signal<string | null>(null);
  grupoSeleccionado = signal<string | null>(null);

  bodegas = signal<SelectOption[]>([]);
  articulos = signal<SelectOption[]>([]);
  grupos = signal<SelectOption[]>([]);

  resultados = signal<ExistenciaDto[]>([]);
  loading = signal(false);
  cargandoCatalogos = signal(true);
  hasBuscado = signal(false);
  exportando = signal(false);

  totalArticulos = computed(() => this.resultados().length);
  totalUnidades = computed(() =>
    this.resultados().reduce((acc, r) => acc + r.saldo, 0)
  );

  ngOnInit(): void {
    Promise.all([
      this.svc.getBodegas().toPromise(),
      this.svc.getArticulos().toPromise(),
      this.svc.getGrupos().toPromise(),
    ]).then(([bodegas, articulos, grupos]) => {
      this.bodegas.set([
        { label: 'Todas las bodegas', value: null },
        ...(bodegas ?? []).map(b => ({ label: `${b.bodega} — ${b.descripcion}`, value: b.bodega })),
      ]);
      this.articulos.set([
        { label: 'Todos los artículos', value: null },
        ...(articulos ?? []).map(a => ({ label: `${a.articulo} — ${a.descripcion}`, value: a.articulo })),
      ]);
      this.grupos.set([
        { label: 'Todos los grupos', value: null },
        ...(grupos ?? []).map(g => ({ label: `${g.grupoInventario} — ${g.descripcion}`, value: g.grupoInventario })),
      ]);
      this.cargandoCatalogos.set(false);
    }).catch(() => {
      this.cargandoCatalogos.set(false);
      this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar los catálogos.' });
    });
  }

  generarReporte(): void {
    if (!this.fechaCorte()) {
      this.toast.add({ severity: 'warn', summary: 'Requerido', detail: 'Selecciona la fecha de corte.' });
      return;
    }
    this.loading.set(true);
    this.hasBuscado.set(true);
    this.svc.generarReporte({
      fechaCorte: this.fechaCorte(),
      bodega: this.bodegaSeleccionada(),
      articulo: this.articuloSeleccionado(),
      grupo: this.grupoSeleccionado(),
    }).pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: data => this.resultados.set(data),
        error: () => this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo generar el reporte.' }),
      });
  }

  limpiar(): void {
    this.bodegaSeleccionada.set(null);
    this.articuloSeleccionado.set(null);
    this.grupoSeleccionado.set(null);
    this.fechaCorte.set(this.hoy());
    this.resultados.set([]);
    this.hasBuscado.set(false);
  }

  async exportarPdf(): Promise<void> {
    const filas = this.resultados();
    if (filas.length === 0) {
      this.toast.add({ severity: 'warn', summary: 'Sin datos', detail: 'Genera el reporte antes de exportar.' });
      return;
    }

    this.exportando.set(true);
    try {
      const [{ default: JsPdf }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);

      const doc = new JsPdf({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      const bodegaLabel = this.labelDe(this.bodegas(), this.bodegaSeleccionada());
      const grupoLabel = this.labelDe(this.grupos(), this.grupoSeleccionado());

      doc.setFontSize(14);
      doc.text('Existencias de inventario', 40, 40);
      doc.setFontSize(9);
      doc.text(`Existencia al: ${this.fechaCorte()}   |   Bodega: ${bodegaLabel}   |   Grupo: ${grupoLabel}`, 40, 58);

      autoTable(doc, {
        startY: 72,
        head: [['Código', 'Descripción', 'U/M', 'Bodega', 'Existencia', 'P. Unitario', 'P. Mayoreo']],
        body: filas.map(r => [
          r.articulo,
          r.descripcion,
          r.unidadMedida,
          r.bodega,
          this.num(r.saldo, 4),
          this.num(r.precioUnitario, 2),
          this.num(r.precioMayoreo, 2),
        ]),
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [37, 99, 235], textColor: 255 },
        columnStyles: {
          4: { halign: 'right' },
          5: { halign: 'right' },
          6: { halign: 'right' },
        },
        margin: { left: 40, right: 40 },
      });

      doc.save(`existencias_${this.fechaCorte()}.pdf`);
    } catch {
      this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo generar el PDF.' });
    } finally {
      this.exportando.set(false);
    }
  }

  private labelDe(opciones: SelectOption[], valor: string | null): string {
    if (valor == null) return 'Todos';
    return opciones.find(o => o.value === valor)?.label ?? valor;
  }

  private num(value: number, decimales: number): string {
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(value ?? 0);
  }

  private hoy(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
