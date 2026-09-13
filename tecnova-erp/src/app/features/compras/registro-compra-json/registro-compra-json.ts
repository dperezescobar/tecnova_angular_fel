import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ToastModule } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { MessageService } from 'primeng/api';
import {
  ComprasService,
  CompraGridviewDto,
  CompraCargarJsonResult,
  CompraUpdateCamposDto,
  ProveedorLookup,
  CompraManualForm
} from './registro-compra-json.service';
import { ReciboCompraService } from './recibo-compra.service';

interface CatalogOption { id: number; nombre: string; }

const OPTS_CLASIFICACION: CatalogOption[] = [
  { id: 0, nombre: 'Sin asignar' },
  { id: 1, nombre: 'Costo' },
  { id: 2, nombre: 'Gasto' }
];

const OPTS_SECTOR: CatalogOption[] = [
  { id: 0, nombre: 'Sin asignar' },
  { id: 1, nombre: 'Industria' },
  { id: 2, nombre: 'Comercio' },
  { id: 3, nombre: 'Agropecuaria' },
  { id: 4, nombre: 'Servicios, Profesiones, Artes y Oficios' }
];

const OPTS_CLASE_DOC: CatalogOption[] = [
  { id: 1, nombre: 'Impreso por Imprenta o Tiquetes' },
  { id: 2, nombre: 'Documento Tributario Electrónico DTE' }
];

const OPTS_COSTO_GASTO: CatalogOption[] = [
  { id: 0, nombre: 'Sin asignar' },
  { id: 1, nombre: 'Gastos de Venta sin Donación' },
  { id: 2, nombre: 'Gastos de Administración sin Donación' },
  { id: 3, nombre: 'Gastos Financieros sin Donación' },
  { id: 4, nombre: 'Costo Artículos Producidos/Comprados Importaciones/Internaciones' },
  { id: 5, nombre: 'Costo Artículos Producidos/Comprados Interno' },
  { id: 6, nombre: 'Costos Indirectos de Fabricación' },
  { id: 7, nombre: 'Mano de obra' }
];

type OriginalMap = Map<number, { clasificacion: number; sector: number; codCostoGasto: number; fechaLibro: string }>;

@Component({
  selector: 'app-registro-compra-json',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ButtonModule, ProgressSpinnerModule, ToastModule, DialogModule],
  providers: [MessageService],
  templateUrl: './registro-compra-json.html',
  styleUrl: './registro-compra-json.scss'
})
export class RegistroCompraJsonComponent {
  private service = inject(ComprasService);
  private reciboService = inject(ReciboCompraService);
  private toast = inject(MessageService);

  cargandoRecibo = signal<number | null>(null);

  readonly optsClasificacion = OPTS_CLASIFICACION;
  readonly optsSector = OPTS_SECTOR;
  readonly optsCostoGasto = OPTS_COSTO_GASTO;
  readonly optsClaseDoc = OPTS_CLASE_DOC;

  compras = signal<CompraGridviewDto[]>([]);
  isLoading = signal(false);
  isUploading = signal(false);
  isSaving = signal(false);
  resultadosUpload = signal<CompraCargarJsonResult[]>([]);
  archivosSeleccionados = signal<File[]>([]);
  isDragOver = signal(false);

  private originalValues = signal<OriginalMap>(new Map());

  // ── Dialog compra manual ──────────────────────────────────────────────────
  showDialogManual = signal(false);
  proveedores = signal<ProveedorLookup[]>([]);
  loadingProveedores = signal(false);
  submittingManual = signal(false);
  filtroProveedor = signal('');

  private readonly FORM_DEFAULT: CompraManualForm = {
    claseDocumento: 2,
    tipoComprobante: 'CCF',
    numeroDocumento: '',
    fecha: '',
    fechaLibro: '',
    nrcProveedor: '',
    duiProveedor: '',
    gravadas: 0,
    iva: 0,
    total: 0,
    clasificacion: 0,
    sector: 0,
    codCostoGasto: 0
  };

  formManual = signal<CompraManualForm>({ ...this.FORM_DEFAULT });

  proveedoresFiltrados = computed(() => {
    const f = this.filtroProveedor().toLowerCase();
    if (!f) return this.proveedores();
    return this.proveedores().filter(p =>
      p.nombre.toLowerCase().includes(f) || p.proveedor.toLowerCase().includes(f)
    );
  });

  // Filtros — por defecto mes actual
  private hoy = new Date();
  fechaInicio = `${this.hoy.getFullYear()}-${String(this.hoy.getMonth() + 1).padStart(2, '0')}-01`;
  fechaFin = this.hoy.toISOString().substring(0, 10);

  resumen = computed(() => {
    const data = this.compras();
    return {
      count: data.length,
      totalIva: data.reduce((s, c) => s + (c.creditoFiscal ?? 0), 0),
      totalCompras: data.reduce((s, c) => s + (c.totalCompras ?? 0), 0)
    };
  });

  camposPendientes = computed(() =>
    this.compras().filter(c => c.clasificacion === 0 || c.sector === 0 || c.codCostoGasto === 0).length
  );

  comprasModificadas = computed(() => {
    const orig = this.originalValues();
    return this.compras().filter(c => {
      const o = orig.get(c.correl);
      if (!o) return false;
      return c.clasificacion !== o.clasificacion || c.sector !== o.sector || c.codCostoGasto !== o.codCostoGasto
        || c.fechaLibro !== o.fechaLibro;
    });
  });

  hayModificaciones = computed(() => this.comprasModificadas().length > 0);

  buscar() {
    if (!this.fechaInicio || !this.fechaFin) {
      this.toast.add({ severity: 'warn', summary: 'Filtro requerido', detail: 'Seleccione rango de fechas.' });
      return;
    }
    this.isLoading.set(true);
    this.service.getGridview(this.fechaInicio, this.fechaFin).subscribe({
      next: data => {
        this.compras.set(data);
        const map: OriginalMap = new Map();
        data.forEach(c => map.set(c.correl, { clasificacion: c.clasificacion, sector: c.sector, codCostoGasto: c.codCostoGasto, fechaLibro: c.fechaLibro }));
        this.originalValues.set(map);
        this.isLoading.set(false);
      },
      error: err => {
        this.toast.add({ severity: 'error', summary: 'Error', detail: err.message });
        this.isLoading.set(false);
      }
    });
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDragOver.set(true);
  }

  onDragLeave() { this.isDragOver.set(false); }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragOver.set(false);
    const files = Array.from(event.dataTransfer?.files ?? []).filter(f => f.name.toLowerCase().endsWith('.json'));
    if (files.length) this.archivosSeleccionados.update(prev => [...prev, ...files]);
  }

  onFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []).filter(f => f.name.toLowerCase().endsWith('.json'));
    if (files.length) this.archivosSeleccionados.update(prev => [...prev, ...files]);
    input.value = '';
  }

  quitarArchivo(index: number) {
    this.archivosSeleccionados.update(prev => prev.filter((_, i) => i !== index));
  }

  limpiarArchivos() {
    this.archivosSeleccionados.set([]);
    this.resultadosUpload.set([]);
  }

  async cargarJsons() {
    const files = this.archivosSeleccionados();
    if (!files.length) {
      this.toast.add({ severity: 'warn', summary: 'Sin archivos', detail: 'Seleccione al menos un archivo JSON.' });
      return;
    }

    this.isUploading.set(true);
    this.resultadosUpload.set([]);

    const payloads: { nombreArchivo: string; contenidoJson: string }[] = [];
    for (const file of files) {
      const text = await file.text();
      payloads.push({ nombreArchivo: file.name, contenidoJson: text });
    }

    this.service.cargarJsons(payloads).subscribe({
      next: resultados => {
        this.resultadosUpload.set(resultados);
        const ok = resultados.filter(r => r.exitoso).length;
        this.toast.add({
          severity: ok > 0 ? 'success' : 'warn',
          summary: 'Proceso completado',
          detail: `${ok} de ${resultados.length} archivo(s) importado(s).`
        });
        this.archivosSeleccionados.set([]);
        this.isUploading.set(false);
        if (ok > 0) this.buscar();
      },
      error: err => {
        this.toast.add({ severity: 'error', summary: 'Error', detail: err.message });
        this.isUploading.set(false);
      }
    });
  }

  onCampoChange(compra: CompraGridviewDto, campo: 'clasificacion' | 'sector' | 'codCostoGasto', valor: number) {
    this.compras.update(prev => prev.map(c => c.correl === compra.correl ? { ...c, [campo]: valor } : c));
  }

  onFechaLibroChange(compra: CompraGridviewDto, valor: string) {
    this.compras.update(prev => prev.map(c => c.correl === compra.correl ? { ...c, fechaLibro: valor } : c));
  }

  guardarCambios() {
    const modificadas = this.comprasModificadas();
    if (!modificadas.length) return;

    this.isSaving.set(true);
    const dtos: CompraUpdateCamposDto[] = modificadas.map(c => ({
      correl: c.correl,
      clasificacion: c.clasificacion,
      sector: c.sector,
      codCostoGasto: c.codCostoGasto,
      fechaLibro: c.fechaLibro
    }));

    this.service.updateCamposBulk(dtos).subscribe({
      next: () => {
        this.originalValues.update(map => {
          const newMap = new Map(map);
          modificadas.forEach(c => newMap.set(c.correl, { clasificacion: c.clasificacion, sector: c.sector, codCostoGasto: c.codCostoGasto, fechaLibro: c.fechaLibro }));
          return newMap;
        });
        this.toast.add({ severity: 'success', summary: 'Guardado', detail: `${modificadas.length} registro(s) actualizados.` });
        this.isSaving.set(false);
      },
      error: err => {
        this.toast.add({ severity: 'error', summary: 'Error', detail: err.message });
        this.isSaving.set(false);
      }
    });
  }

  esDirty(compra: CompraGridviewDto): boolean {
    const orig = this.originalValues().get(compra.correl);
    if (!orig) return false;
    return compra.clasificacion !== orig.clasificacion || compra.sector !== orig.sector || compra.codCostoGasto !== orig.codCostoGasto
      || compra.fechaLibro !== orig.fechaLibro;
  }

  eliminar(compra: CompraGridviewDto) {
    if (!confirm(`¿Eliminar la compra ${compra.numero.substring(0, 8)}...?`)) return;
    this.service.eliminar(compra.correl).subscribe({
      next: () => {
        this.compras.update(prev => prev.filter(c => c.correl !== compra.correl));
        this.originalValues.update(map => { const m = new Map(map); m.delete(compra.correl); return m; });
        this.toast.add({ severity: 'success', summary: 'Eliminado', detail: 'Compra eliminada.' });
      },
      error: err => this.toast.add({ severity: 'error', summary: 'Error', detail: err.message })
    });
  }

  verRecibo(compra: CompraGridviewDto) {
    this.cargandoRecibo.set(compra.correl);
    this.service.getRecibo(compra.correl).subscribe({
      next: recibo => {
        this.cargandoRecibo.set(null);
        this.openDteVisualPreview(this.reciboService.buildDocumentoVisual(recibo));
      },
      error: err => {
        this.cargandoRecibo.set(null);
        const detail = err.error?.message ?? err.error ?? err.message ?? 'Error desconocido';
        this.toast.add({ severity: 'error', summary: 'Error', detail });
      }
    });
  }

  private openDteVisualPreview(htmlCompleto: string) {
    const popup = window.open('', '_blank');
    if (!popup) {
      this.toast.add({ severity: 'warn', summary: 'Recibo', detail: 'El navegador bloqueó la vista del recibo.' });
      return;
    }
    const toolbarHtml = `
      <div id="printToolbar" style="width:100%; text-align:center; padding:15px 0; background:#f8f9fa; border-bottom:1px solid #dee2e6; margin-bottom:20px; font-family:sans-serif;">
        <button onclick="window.print()" style="padding:12px 25px; background:#023c8d; color:white; border:none; border-radius:6px; cursor:pointer; font-size:14px; font-weight:bold; box-shadow:0 2px 4px rgba(0,0,0,0.1);">
          📥 Descargar / Imprimir
        </button>
      </div>
      <style>@media print { #printToolbar { display:none !important; } body { margin:0; } }</style>
    `;
    const htmlFinal = htmlCompleto.includes('<body>')
      ? htmlCompleto.replace('<body>', `<body>${toolbarHtml}`)
      : `${toolbarHtml}${htmlCompleto}`;
    popup.document.open();
    popup.document.write(htmlFinal);
    popup.document.close();
  }

  numeroCorto(numero: string): string {
    if (!numero || numero.length <= 12) return numero;
    return numero.substring(0, 12) + '…';
  }

  claseCampo(valor: number): string {
    return valor > 0 ? 'campo-ok' : 'campo-pendiente';
  }

  // ── Dialog compra manual ──────────────────────────────────────────────────
  abrirDialogManual() {
    this.formManual.set({ ...this.FORM_DEFAULT, fecha: this.fechaFin });
    this.filtroProveedor.set('');
    this.showDialogManual.set(true);
    if (!this.proveedores().length) {
      this.loadingProveedores.set(true);
      this.service.getProveedores().subscribe({
        next: data => { this.proveedores.set(data); this.loadingProveedores.set(false); },
        error: () => this.loadingProveedores.set(false)
      });
    }
  }

  setManualField<K extends keyof CompraManualForm>(campo: K, valor: CompraManualForm[K]) {
    this.formManual.update(f => ({ ...f, [campo]: valor }));
  }

  onProveedorSelect(nrc: string) {
    const prov = this.proveedores().find(p => p.proveedor === nrc);
    this.formManual.update(f => ({
      ...f,
      nrcProveedor: nrc,
      duiProveedor: prov?.nit ?? f.duiProveedor
    }));
  }

  onGravadasChange(raw: string) {
    const gravadas = parseFloat(raw) || 0;
    const iva = Math.round(gravadas * 0.13 * 100) / 100;
    this.formManual.update(f => ({ ...f, gravadas, iva, total: gravadas + iva }));
  }

  onIvaChange(raw: string) {
    const iva = parseFloat(raw) || 0;
    const gravadas = this.formManual().gravadas;
    this.formManual.update(f => ({ ...f, iva, total: gravadas + iva }));
  }

  onTotalChange(raw: string) {
    this.formManual.update(f => ({ ...f, total: parseFloat(raw) || 0 }));
  }

  submitManual() {
    const f = this.formManual();
    if (!f.tipoComprobante || !f.numeroDocumento.trim() || !f.fecha || !f.fechaLibro || !f.nrcProveedor || f.gravadas <= 0 || f.total <= 0) {
      this.toast.add({ severity: 'warn', summary: 'Campos requeridos', detail: 'Complete todos los campos obligatorios incluyendo Fecha Libro.' });
      return;
    }
    this.submittingManual.set(true);
    this.service.registrarManual(f).subscribe({
      next: () => {
        this.showDialogManual.set(false);
        this.toast.add({ severity: 'success', summary: 'Registrado', detail: 'Compra manual registrada correctamente.' });
        this.buscar();
        this.submittingManual.set(false);
      },
      error: err => {
        const detail = err.error?.message ?? err.error ?? err.message ?? 'Error desconocido';
        this.toast.add({ severity: 'error', summary: 'Error', detail });
        this.submittingManual.set(false);
      }
    });
  }

  ngOnInit() { this.buscar(); }
}
