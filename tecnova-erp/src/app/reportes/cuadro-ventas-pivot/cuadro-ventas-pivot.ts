import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import WebDataRocks from '@webdatarocks/webdatarocks';
import { CuadroVentasService } from './cuadro-ventas-pivot.service';

// Evita que WebDataRocks descomponga fecha en Day/Month/Year
const FIELD_MAPPING = {
  fecha: { type: 'string', caption: 'Fecha' },
};

const DEFAULT_REPORT = {
  slice: {
    rows: [
      { uniqueName: 'cliente'              },
      { uniqueName: 'fecha' },
      { uniqueName: 'numero'               },
    ],
    columns: [
      { uniqueName: 'anio'     },
      { uniqueName: 'mes'      },
      { uniqueName: 'Measures' },
    ],
    measures: [
      { uniqueName: 'subTotal',     aggregation: 'sum', caption: 'Sub Total'     },
      { uniqueName: 'iva',          aggregation: 'sum', caption: 'IVA'           },
      { uniqueName: 'retencion',    aggregation: 'sum', caption: 'Retención'     },
      { uniqueName: 'totalFactura', aggregation: 'sum', caption: 'Total Factura' },
    ],
  },
  formats: [
    {
      name:                '',
      thousandsSeparator:  ',',
      decimalSeparator:    '.',
      decimalPlaces:        2,
      currencySymbol:      '$',
      currencySymbolAlign: 'left',
      nullValue:           '-',
      textAlign:           'right',
    },
  ],
  options: { grid: { type: 'classic', showTotals: 'on', showGrandTotals: 'on' } },
};

@Component({
  selector: 'app-cuadro-ventas-pivot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [DecimalPipe, FormsModule, ButtonModule, ToastModule],
  providers: [MessageService],
  templateUrl: './cuadro-ventas-pivot.html',
  styleUrl: './cuadro-ventas-pivot.scss',
})
export class CuadroVentasPivotComponent implements OnDestroy {
  @ViewChild('pivotContainer', { static: true }) pivotContainer!: ElementRef<HTMLDivElement>;

  private svc   = inject(CuadroVentasService);
  private toast = inject(MessageService);
  private cdr   = inject(ChangeDetectorRef);

  fechaDesde = signal<string>(this.primerDiaMes());
  fechaHasta = signal<string>(this.hoy());
  loading    = signal(false);
  totalReg   = signal(0);

  private pivot!: WebDataRocks;

  constructor() {
    afterNextRender(() => {
      this.pivot = new WebDataRocks({
        container: this.pivotContainer.nativeElement,
        toolbar:   true,
        height:    '100%',
        report: {
          dataSource: { data: [], mapping: FIELD_MAPPING },
          ...DEFAULT_REPORT,
        },
        // Oculta Connect y Open del toolbar
        beforetoolbarcreated: (toolbar: any) => {
          const tabs = toolbar.getTabs();
          toolbar.getTabs = () => tabs.filter((tab: any) =>
            tab.id !== 'wdr-tab-connect' && tab.id !== 'wdr-tab-open'
          );
        },
      });
      // Expande todos los nodos tras cada setReport()
      this.pivot.on('reportcomplete', () => this.pivot.expandAllData());
    });
  }

  generarReporte(): void {
    if (!this.fechaDesde() || !this.fechaHasta()) {
      this.toast.add({ severity: 'warn', summary: 'Requerido', detail: 'Selecciona ambas fechas.' });
      return;
    }
    this.loading.set(true);
    this.svc.getCuadroVentas(this.fechaDesde(), this.fechaHasta())
      .pipe(finalize(() => { this.loading.set(false); this.cdr.markForCheck(); }))
      .subscribe({
        next: data => {
          this.totalReg.set(data.length);
          // Pre-ordenar por fecha (yyyy-MM-dd ordena lexicográficamente)
          // y convertir a dd/MM/yyyy para que WDR no lo descomponga en Day/Month/Year
          const sorted = [...data].sort((a, b) => a.fecha.localeCompare(b.fecha));
          const wdrData = sorted.map(r => ({
            ...r,
            fecha: r.fecha.split('-').reverse().join('/'),
          }));
          this.pivot.setReport({
            dataSource: { data: wdrData, mapping: FIELD_MAPPING },
            ...DEFAULT_REPORT,
          });
          this.cdr.markForCheck();
        },
        error: () => this.toast.add({
          severity: 'error',
          summary:  'Error',
          detail:   'No se pudo cargar el cuadro de ventas.',
        }),
      });
  }

  ngOnDestroy(): void {
    this.pivot?.dispose();
  }

  private primerDiaMes(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }

  private hoy(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
