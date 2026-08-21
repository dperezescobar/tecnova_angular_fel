import { ChangeDetectionStrategy, Component, inject, input, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { LibrosFiscalesService, LibroVentasConsumidorFinalResponse } from '../../services/libros-fiscales.service';
import { AuthService } from '../../../core/services/auth';

@Component({
  selector: 'app-libro-consumidor-final',
  standalone: true,
  imports: [CommonModule, ButtonModule, ProgressSpinnerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './libro-consumidor-final.html',
  styleUrl: './libro-consumidor-final.scss'
})
export class LibroConsumidorFinalComponent {
  private readonly librosService = inject(LibrosFiscalesService);
  private readonly authService = inject(AuthService);

  // Inputs reactivos desde el componente padre (Signals)
  desde = input.required<string>();
  hasta = input.required<string>();

  // Estados locales de la UI
  loading = signal<boolean>(false);
  reportData = signal<LibroVentasConsumidorFinalResponse[]>([]);
  filaSeleccionada = signal<number | null>(null);
  ultimoFolio      = signal<number>(0);

  // Totales dinámicos calculados eficientemente mediante computeds reactivos
  totales = computed(() => {
    const data = this.reportData();
    return data.reduce((acc, row) => ({
      noSujetas:    acc.noSujetas    + (row.NO_SUJETAS      ?? 0),
      exentas:      acc.exentas      + (row.EXENTAS         ?? 0),
      gravadas:     acc.gravadas     + (row.GRAVADAS        ?? 0),
      exportaciones:acc.exportaciones+ (row.EXPORTACIONES   ?? 0),
      debitoFiscal: acc.debitoFiscal + (row.TOTAL_IMPUESTO1 ?? 0),
      retencion:    acc.retencion    + (row.RETENCION       ?? 0),
      total:        acc.total        + (row.TOTAL           ?? 0)
    }), { noSujetas: 0, exentas: 0, gravadas: 0, exportaciones: 0, debitoFiscal: 0, retencion: 0, total: 0 });
  });

  ventasNetasGravadas = computed(() => {
    const t = this.totales();
    return Math.max(0, t.gravadas - t.debitoFiscal);
  });

  constructor() {
    // Carga automática al detectar cualquier cambio en el rango de fechas
    effect(() => {
      this.cargarReporte();
    });
  }

  cargarReporte(): void {
    const empresaId = this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0;
    if (!empresaId) return;

    this.loading.set(true);

    this.librosService.getLibroVentasConsumidorFinal({
      Sucursal: '',
      PuntoVenta: '',
      FechaDesde: this.desde(),
      FechaHasta: this.hasta(),
      Mes: '',
      NrcEmpresa: '',
      NitEmpresa: '',
      NombreSucursal: '',
      IdEmpresa: empresaId
    }).subscribe({
      next: (data) => {
        this.reportData.set(data ?? []);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error al cargar libro de ventas consumidor final:', err);
        this.reportData.set([]);
        this.loading.set(false);
      }
    });
  }

  seleccionarFila(correlativo: number): void {
    this.filaSeleccionada.update(current => current === correlativo ? null : correlativo);
  }

  onFolioChange(event: Event): void {
    this.ultimoFolio.set(+((event.target as HTMLInputElement).value) || 0);
  }

  private formatDateEs(iso: string): string {
    const p = iso.split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
  }

  private getCompanyContext() {
    const empresa = this.authService.currentUser()?.selectedEmpresa;
    return {
      nombre: empresa?.nombreComercial || 'Empresa No Configurada',
      nrc: empresa?.nrc || '—',
      nit: empresa?.nit || '—',
      periodo: `${this.formatDateEs(this.desde())} al ${this.formatDateEs(this.hasta())}`
    };
  }

  descargarExcel(): void {
    const headers = [
      'Día', 'Código de Generación', 'Código de Generación',
      'No Sujetas', 'Exentas', 'Ventas Gravadas Locales', 'Exportaciones', 'Retención 1%', 'Ventas Totales', 'Ventas por Cuenta de Terceros'
    ];

    const mappedRows: any[] = this.reportData().map((row) => ({
      Dia:           row.FECHA,
      CodGenMin:     row.CodigoGeneracion_Min || '—',
      CodGenMax:     row.CodigoGeneracion_Max || '—',
      NoSujetas:     row.NO_SUJETAS     ?? 0,
      Exentas:       row.EXENTAS        ?? 0,
      Gravadas:      row.GRAVADAS       ?? 0,
      Exportaciones: row.EXPORTACIONES  ?? 0,
      Retencion:     row.RETENCION      ?? 0,
      Total:         row.TOTAL          ?? 0,
      Terceros:      0
    }));

    const t = this.totales();
    mappedRows.push({
      Dia: '', CodGenMin: 'TOTALES DEL MES', CodGenMax: '',
      NoSujetas:     t.noSujetas,
      Exentas:       t.exentas,
      Gravadas:      t.gravadas,
      Exportaciones: t.exportaciones,
      Retencion:     t.retencion,
      Total:         t.total,
      Terceros:      0
    });

    this.librosService.exportToExcel(mappedRows, headers, `Libro_Ventas_Consumidor_${this.desde()}`);
  }

  descargarPDF(): void {
    const fmt = (n: number): string =>
      `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const headers: any[][] = [
      [
        { content: 'Día',                            rowSpan: 2, styles: { valign: 'bottom', halign: 'center' } },
        { content: 'Código de Generación',           rowSpan: 2, styles: { valign: 'bottom', halign: 'center' } },
        { content: 'Código de Generación',           rowSpan: 2, styles: { valign: 'bottom', halign: 'center' } },
        { content: 'Ventas por Cuenta Propia',       colSpan: 6, styles: { halign: 'center' } },
        { content: 'Ventas por\nCuenta de\nTerceros', rowSpan: 2, styles: { valign: 'bottom', halign: 'center' } }
      ],
      [
        'No Sujetas', 'Exentas', 'Ventas Gravadas\nLocales', 'Exportaciones', 'Retención 1%', 'Ventas Totales'
      ]
    ];

    const mappedRows = this.reportData().map((row) => [
      row.FECHA,
      row.CodigoGeneracion_Min || '—',
      row.CodigoGeneracion_Max || '—',
      fmt(row.NO_SUJETAS      ?? 0),
      fmt(row.EXENTAS         ?? 0),
      fmt(row.GRAVADAS        ?? 0),
      fmt(row.EXPORTACIONES   ?? 0),
      fmt(row.RETENCION       ?? 0),
      fmt(row.TOTAL           ?? 0),
      fmt(0)
    ]);

    const t = this.totales();
    const footRow = [
      '',
      { content: 'TOTALES DEL MES', styles: { halign: 'right', fontStyle: 'bold' } },
      '',
      { content: fmt(t.noSujetas),     styles: { halign: 'right' } },
      { content: fmt(t.exentas),       styles: { halign: 'right' } },
      { content: fmt(t.gravadas),      styles: { halign: 'right' } },
      { content: fmt(t.exportaciones), styles: { halign: 'right' } },
      { content: fmt(t.retencion),     styles: { halign: 'right' } },
      { content: fmt(t.total),         styles: { halign: 'right' } },
      { content: fmt(0),               styles: { halign: 'right' } }
    ];

    const resumenRows = [
      { label: 'Ventas no sujetas',                value: t.noSujetas },
      { label: 'Ventas exentas',                   value: t.exentas },
      { label: 'Ventas totales gravadas',           value: t.gravadas },
      { label: 'Rebajas y devoluciones S/Ventas',  value: 0 },
      { label: 'Ventas netas gravadas',             value: t.gravadas },
      { label: 'Débito Fiscal',                    value: t.debitoFiscal },
      { label: 'Exportaciones',                    value: t.exportaciones },
      { label: '1% Retención',                     value: t.retencion },
      { separator: true, label: '', value: 0 },
      { label: 'VENTAS TOTALES',                   value: t.noSujetas + t.exentas + t.gravadas + t.debitoFiscal + t.exportaciones, bold: true }
    ];

    this.librosService.exportToPdf(
      'Libro de Ventas a Consumidor Final',
      headers,
      mappedRows,
      this.getCompanyContext(),
      `Libro_Ventas_Consumidor_${this.desde()}`,
      undefined,
      {
        pageFormat:   [1050, 650] as [number, number],
        dataFontSize: 8,
        footRows:     [footRow],
        folioBase:    this.ultimoFolio(),
        resumenRows,
        columnStyles: {
          0: { cellWidth: 35,  halign: 'center' },      // Día
          1: { cellWidth: 195, overflow: 'linebreak' }, // CodGen Min
          2: { cellWidth: 195, overflow: 'linebreak' }, // CodGen Max
          3: { cellWidth: 60,  halign: 'right' },       // No Suj.
          4: { cellWidth: 60,  halign: 'right' },       // Exentas
          5: { cellWidth: 65,  halign: 'right' },       // Gravadas
          6: { cellWidth: 65,  halign: 'right' },       // Export.
          7: { cellWidth: 55,  halign: 'right' },       // Ret 1%
          8: { cellWidth: 65,  halign: 'right' },       // Ventas Totales
          9: { cellWidth: 65,  halign: 'right' }        // Terceros
        }
      }
    );
  }
}