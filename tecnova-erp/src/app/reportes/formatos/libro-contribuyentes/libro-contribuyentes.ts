import { ChangeDetectionStrategy, Component, inject, input, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { LibrosFiscalesService, ReporteLibroVentasResponse } from '../../services/libros-fiscales.service';
import { AuthService } from '../../../core/services/auth';

@Component({
  selector: 'app-libro-contribuyentes',
  standalone: true,
  imports: [CommonModule, ButtonModule, ProgressSpinnerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './libro-contribuyentes.html',
  styleUrl: './libro-contribuyentes.scss'
})
export class LibroContribuyentesComponent {
  private readonly librosService = inject(LibrosFiscalesService);
  private readonly authService = inject(AuthService);

  // Inputs reactivos usando la API moderna de Angular (Signals)
  desde = input.required<string>();
  hasta = input.required<string>();

  // States de UI
  loading = signal<boolean>(false);
  reportData = signal<ReporteLibroVentasResponse[]>([]);
  filaSeleccionada = signal<number | null>(null);
  verCuadroResumen = signal<boolean>(true); // Cuadro "RESUMEN DE OPERACIONES" (adicional) + firma

  // Totales Calculados en memoria de manera ultra-eficiente vía Computed
  totales = computed(() => {
    const data = this.reportData();
    return data.reduce((acc, row) => ({
      exentas: acc.exentas + (row.EXENTAS ?? 0),
      gravadas: acc.gravadas + (row.GRAVADAS ?? 0),
      noSujetas: acc.noSujetas + (row.NO_SUJETAS ?? 0),
      debitoFiscal: acc.debitoFiscal + (row.TOTAL_IMPUESTO1 ?? 0),
      retencion: acc.retencion + (row.RETENCION ?? 0),
      percepcion: acc.percepcion + (row.PERCEPCION ?? 0),
      total: acc.total + (row.TOTAL ?? 0)
    }), { exentas: 0, gravadas: 0, noSujetas: 0, debitoFiscal: 0, retencion: 0, percepcion: 0, total: 0 });
  });

  constructor() {
    // Escucha de forma automática los cambios en las fechas del padre para refrescar la data
    effect(() => {
      this.cargarReporte();
    });
  }

  cargarReporte(): void {
    const empresaId = this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0;
    if (!empresaId) return;

    this.loading.set(true);
    
    this.librosService.getReporteLibroVentasContribuyente({
      FechaDesde: this.desde(),
      FechaHasta: this.hasta(),
      Sucursal: '',
      NombreSucursal: '',
      PuntoVenta: '',
      IdEmpresa: empresaId,
      MostrarCuadro: 'NO'
    }).subscribe({
      next: (data) => {
        this.reportData.set(data ?? []);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error al cargar libro de ventas contribuyentes:', err);
        this.reportData.set([]);
        this.loading.set(false);
      }
    });
  }

  seleccionarFila(correlativo: number): void {
    this.filaSeleccionada.update(current => current === correlativo ? null : correlativo);
  }

  private formatDateEs(iso: string): string {
    const p = iso.split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
  }

  private getCompanyContext() {
    const empresa = this.authService.currentUser()?.selectedEmpresa;
    return {
      nombre: empresa?.nombre || 'Empresa No Configurada',
      nrc: empresa?.nrc || '—',
      nit: empresa?.nit || '—',
      periodo: `${this.formatDateEs(this.desde())} al ${this.formatDateEs(this.hasta())}`
    };
  }

  descargarExcel(): void {
    const headers = [
      'N°', 'Fecha', 'N° Control DTE', 'Cód. Generación', 'Sello Recepción',
      'NRC', 'NIT/DUI', 'Cliente', 'Exentas', 'Gravadas', 'No Suj.',
      'Débito', 'Ret 1%', 'Perc 1%', 'Total'
    ];

    const mappedRows: any[] = this.reportData().map((row, idx) => ({
      N:          idx + 1,
      Fecha:      row.FECHA?.substring(0, 10) || '—',
      NoControl:  row.Numero_Control    || '—',
      CodGen:     row.CodigoGeneracion  || '—',
      Sello:      row.Sello_Recepcion   || '—',
      NRC:        row.REGISTRO_COMERCIO || '—',
      NIT:        row.NIT               || '—',
      Cliente:    row.NOMBRE || row.CLIENTE || '—',
      Exentas:    row.EXENTAS         ?? 0,
      Gravadas:   row.GRAVADAS        ?? 0,
      NoSujetas:  row.NO_SUJETAS      ?? 0,
      Debito:     row.TOTAL_IMPUESTO1 ?? 0,
      Retencion:  row.RETENCION       ?? 0,
      Percepcion: row.PERCEPCION      ?? 0,
      Total:      row.TOTAL           ?? 0
    }));

    const t = this.totales();
    mappedRows.push({
      N: null, Fecha: '', NoControl: '', CodGen: '', Sello: '', NRC: '', NIT: '',
      Cliente:    'TOTALES DEL MES',
      Exentas:    t.exentas,
      Gravadas:   t.gravadas,
      NoSujetas:  t.noSujetas,
      Debito:     t.debitoFiscal,
      Retencion:  t.retencion,
      Percepcion: t.percepcion,
      Total:      t.total
    });

    this.librosService.exportToExcel(mappedRows, headers, `Libro_Ventas_Contribuyentes_${this.desde()}`);
  }

  descargarPDF(): void {
    const fmt = (n: number): string =>
      `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const headers = [[
      'N°', 'Fecha', 'N° Control DTE', 'Cód. Generación', 'Sello Recepción',
      'NRC', 'NIT/DUI', 'Cliente',
      'Exentas', 'Gravadas', 'No Suj.', 'Débito', 'Ret 1%', 'Perc 1%', 'Total'
    ]];

    const mappedRows = this.reportData().map((row, idx) => [
      idx + 1,
      row.FECHA?.substring(0, 10) || '—',
      row.Numero_Control    || '—',
      row.CodigoGeneracion  || '—',
      row.Sello_Recepcion   || '—',
      row.REGISTRO_COMERCIO || '—',
      row.NIT || '—',
      row.NOMBRE || row.CLIENTE || '—',
      fmt(row.EXENTAS        ?? 0),
      fmt(row.GRAVADAS       ?? 0),
      fmt(row.NO_SUJETAS     ?? 0),
      fmt(row.TOTAL_IMPUESTO1 ?? 0),
      fmt(row.RETENCION      ?? 0),
      fmt(row.PERCEPCION     ?? 0),
      fmt(row.TOTAL          ?? 0)
    ]);

    // Totales en foot: línea divisoria automática, "TOTALES DEL MES" alineado a columna Cliente
    const t = this.totales();
    const footRow = [
      '', '', '', '', '', '', '',
      { content: 'TOTALES DEL MES', styles: { halign: 'right', fontStyle: 'bold' } },
      { content: fmt(t.exentas),     styles: { halign: 'right' } },
      { content: fmt(t.gravadas),    styles: { halign: 'right' } },
      { content: fmt(t.noSujetas),   styles: { halign: 'right' } },
      { content: fmt(t.debitoFiscal),styles: { halign: 'right' } },
      { content: fmt(t.retencion),   styles: { halign: 'right' } },
      { content: fmt(t.percepcion),  styles: { halign: 'right' } },
      { content: fmt(t.total),       styles: { halign: 'right' } }
    ];

    // Cuadro oficial "RESUMEN DE OPERACIONES" (adicional, solo si el check está activo).
    const n = (v: number): string => (v ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const cuadroOperaciones = this.verCuadroResumen() ? {
      head: [
        [
          { content: 'RESUMEN DE OPERACIONES', rowSpan: 2 },
          { content: 'PROPIAS', colSpan: 2 },
          { content: 'IVA RETENIDO', rowSpan: 2 },
          { content: 'IVA PERCIBIDO', rowSpan: 2 }
        ],
        ['VALOR NETO', 'DÉBITO FISCAL']
      ],
      body: [
        ['VENTAS NETAS INTERNAS GRAVADAS A CONTRIBUYENTES', n(t.gravadas), n(t.debitoFiscal), n(t.retencion), n(t.percepcion)],
        ['VENTAS NETAS INTERNAS A CONSUMIDORES', n(0), n(0), n(0), ''],
        ['TOTAL DE OPERACIONES INTERNAS GRAVADAS', n(t.gravadas), n(t.debitoFiscal), n(t.retencion), n(t.percepcion)],
        ['VENTAS NETAS INTERNAS EXENTAS A CONTRIBUYENTES', n(t.exentas), n(0), '', ''],
        ['VENTAS NETAS INTERNAS A CONSUMIDORES', n(0), n(0), '', ''],
        ['TOTAL DE OPERACIONES INTERNAS EXENTAS', n(t.exentas), n(0), '', ''],
        ['VENTAS NETAS INTERNAS NO SUJETAS CONTRIBUYENTES', n(t.noSujetas), n(0), '', ''],
        ['VENTAS INTERNAS NO SUJETAS A CONSUMIDORES', n(0), n(0), '', ''],
        ['TOTAL OPERACIONES INTERNAS NO SUJETAS', n(t.noSujetas), n(0), '', ''],
        ['EXPORTACIONES SEGÚN FACTURAS DE EXPORTACIÓN', n(0), n(0), '', '']
      ]
    } : undefined;

    this.librosService.exportToPdf(
      'Libro de Ventas a Contribuyentes',
      headers,
      mappedRows,
      this.getCompanyContext(),
      `Libro_Ventas_Contribuyentes_${this.desde()}`,
      {
        gravadas:     t.gravadas,
        exentas:      t.exentas,
        noSujetas:    t.noSujetas,
        debitoFiscal: t.debitoFiscal,
        retencion:    t.retencion,
        percepcion:   t.percepcion,
        total:        t.total
      },
      {
        cuadroOperaciones,
        pageFormat:   [1350, 842] as [number, number],
        dataFontSize: 8,
        footRows:     [footRow],
        columnStyles: {
          0:  { cellWidth: 22,  halign: 'center' },  // N°
          1:  { cellWidth: 56 },                     // Fecha
          2:  { cellWidth: 170 },                    // N° Control DTE  (170-8pad=162pt ≈ 36 chars)
          3:  { cellWidth: 170 },                    // Cód. Generación
          4:  { cellWidth: 170 },                    // Sello Recepción
          5:  { cellWidth: 52 },                     // NRC
          6:  { cellWidth: 76 },                     // NIT/DUI
          7:  { cellWidth: 110, overflow: 'linebreak' }, // Cliente (hasta 3 líneas)
          8:  { cellWidth: 62,  halign: 'right' },   // Exentas
          9:  { cellWidth: 62,  halign: 'right' },   // Gravadas
          10: { cellWidth: 56,  halign: 'right' },   // No Suj.
          11: { cellWidth: 62,  halign: 'right' },   // Débito
          12: { cellWidth: 56,  halign: 'right' },   // Ret 1%
          13: { cellWidth: 56,  halign: 'right' },   // Perc 1%
          14: { cellWidth: 62,  halign: 'right' }    // Total
        }
      }
    );
  }
}