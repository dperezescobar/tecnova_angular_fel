import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal, viewChild, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, finalize, firstValueFrom, map, of } from 'rxjs';

import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { CardModule } from 'primeng/card';
import { SelectModule } from 'primeng/select';
import { DialogModule } from 'primeng/dialog';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageModule } from 'primeng/message';
import { CheckboxModule } from 'primeng/checkbox';
import { ToastModule } from 'primeng/toast';
import { PaginatorModule, PaginatorState } from 'primeng/paginator';
import { MessageService } from 'primeng/api';

import { ArticulosService } from './services/articulos';
import {
  ArticuloBodegaDto,
  ArticuloComponenteDto,
  ArticuloDescuentoDto,
  ArticuloDetalleDto,
  ArticuloDto,
  ArticuloDescuentoUpdateDto,
  ArticuloImpuestoDto,
  ArticuloTmCatalogoDto,
  ArticuloUpdateDto,
  GrupoInventarioConsultaDto,
  GrupoInventarioUpdateDto,
  PuntoVentaGrupoItemDto,
  SelectOption
} from '../../core/models/articulos.models';
import { AuthService } from '../../core/services/auth';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-articulos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    CardModule,
    SelectModule,
    DialogModule,
    ProgressSpinnerModule,
    MessageModule,
    CheckboxModule,
    ToastModule,
    PaginatorModule
  ],
  providers: [MessageService],
  templateUrl: './articulos.html',
  styleUrls: ['./articulos.scss']
})
export class ArticulosComponent {
  private articulosService = inject(ArticulosService);
  private authService = inject(AuthService);
  private fb = inject(FormBuilder);
  private messageService = inject(MessageService);
articuloCreado = output<string>();
  articulos = signal<ArticuloDto[]>([]);
  loadingList = signal(false);
  loadingDetail = signal(false);
  saving = signal(false);
  errorMessage = signal('');
  successMessage = signal('');
  filterText = signal('');
  verImagenes = signal(false);
  showPdfDialog = signal(false);
  exportandoPdf = signal(false);
  exportandoEnSegundoPlano = signal(false);
  exportProgresoTexto = signal('');
  exportGrupoFiltro = signal('');
  exportSoloActivos = signal(false);
  articuloImagenesUrls = signal<Record<string, string>>({});
  private loadingArticuloImageCodes = new Set<string>();
  private cancelExportRequested = false;
  paginaActual = signal(0);
  filasPorPagina = signal(25);

  gruposDisponibles = computed(() => {
    const list = this.articulos();
    const set = new Set<string>();
    for (const item of list) {
      const g = (item.GrupoInventario ?? '').trim();
      if (g) set.add(g);
    }
    return Array.from(set).sort();
  });

  itemsParaExportar = computed(() => {
    let list = this.articulos();
    const grupo = this.exportGrupoFiltro().trim();
    if (grupo) {
      list = list.filter(a => (a.GrupoInventario ?? '').trim().toUpperCase() === grupo.toUpperCase());
    }
    if (this.exportSoloActivos()) {
      list = list.filter(a => a.Activo);
    }
    const query = this.filterText().toLowerCase().trim();
    if (query) {
      list = list.filter(a =>
        a.Articulo.toLowerCase().includes(query) ||
        a.Descripcion.toLowerCase().includes(query) ||
        a.TipoArticulo.toLowerCase().includes(query)
      );
    }
    return list;
  });

  showDetail = signal(false);
  isEditMode = signal(false);

  // ── Imagen del producto ─────────────────────────────────────────────────────
  /** Data-URL o Object-URL para el <img> de vista previa */
  imagenPreview = signal<string | null>(null);
  /** Blob comprimido listo para subir (null = ya está guardado o no se seleccionó) */
  imagenPendiente = signal<Blob | null>(null);
  /** Nombre de archivo normalizado del blob pendiente */
  imagenFileName = signal<string>('foto.jpg');
  uploadingImagen = signal(false);
  /** true cuando imagenPreview es un object URL que debemos revocar al limpiar */
  private isObjectUrl = false;
  // Referencias a los inputs ocultos de selector de archivo / cámara
  private fileInputGallery = viewChild<ElementRef<HTMLInputElement>>('fileInputGallery');
  private fileInputCamera = viewChild<ElementRef<HTMLInputElement>>('fileInputCamera');
  // ────────────────────────────────────────────────────────────────────────────

  impuestosDetalle = signal<ArticuloImpuestoDto[]>([]);
  bodegasDetalle = signal<ArticuloBodegaDto[]>([]);
  descuentosDetalle = signal<ArticuloDescuentoDto[]>([]);

  impuestoOptions = signal<SelectOption[]>([]);
  bodegaOptions = signal<SelectOption[]>([]);
  tipoArticuloOptions = signal<SelectOption[]>([]);
  unidadMedidaOptions = signal<SelectOption[]>([]);
  grupoInventarioOptions = signal<SelectOption[]>([]);
  subGrupoInventarioOptions = signal<SelectOption[]>([]);
  showGrupoDialog = signal(false);
  grupoDialogNivel = signal<1 | 2>(1);
  grupoDialogRows = signal<GrupoInventarioConsultaDto[]>([]);
  grupoDialogSelectedCode = signal('');
  grupoDialogLoading = signal(false);
  grupoDialogSaving = signal(false);
  grupoDialogPuntosVenta = signal<PuntoVentaGrupoItemDto[]>([]);
  grupoDialogPvLoading = signal(false);

  descuentoTipoOptions: SelectOption[] = [
    { value: 'P', label: 'Porcentaje' },
    { value: 'M', label: 'Dólares' }
  ];

  impuestoTokenOptions = computed(() => {
    const opts = [...this.impuestoOptions()];
    const ivaIdx = opts.findIndex((o) => o.value.toUpperCase() === 'IVA');
    if (ivaIdx > 0) opts.unshift(opts.splice(ivaIdx, 1)[0]);
    return opts.slice(0, 3);
  });
  grupoDialogTitle = computed(() =>
    this.grupoDialogNivel() === 1
      ? 'Mantenimiento de Grupo'
      : 'Mantenimiento de SubGrupo'
  );

  /** Catálogo de bodegas sin las que ya están asignadas al artículo, para no ofrecer duplicados en el selector. */
  bodegaOptionsDisponibles = computed(() => {
    const asignadas = new Set(this.bodegasDetalle().map((row) => row.Bodega));
    return this.bodegaOptions().filter((opt) => !asignadas.has(opt.value));
  });

  private isModoEdicionValue(): boolean {
    const rawValue = this.articuloForm.controls.Modificar.value;
    const parsed = Number(rawValue);
    return this.isEditMode() || parsed === 1;
  }

  isModoEdicion(): boolean {
    return this.isModoEdicionValue();
  }

  canEditPrecioVenta(): boolean {
    const tipoUsuario = String(this.authService.currentUser()?.tipoUsuario ?? '').trim().toUpperCase();
    return tipoUsuario === 'A';
  }

  private getDefaultTipoArticulo(): string {
    const opts = this.tipoArticuloOptions();
    const terminado = opts.find(
      (o) => o.label.toUpperCase().includes('TERMINADO') || o.value.toUpperCase().includes('TERMINADO')
    );
    return terminado?.value ?? opts[0]?.value ?? '';
  }

  private getDefaultImpuestoValue(): string {
    const options = this.impuestoOptions();
    const iva = options.find((item) => item.value.toUpperCase() === 'IVA');
    return iva?.value ?? options[0]?.value ?? '';
  }

  private toBoolean(value: unknown): boolean {
    const normalized = String(value ?? '').trim().toUpperCase();
    return normalized === 'S' || normalized === '1' || normalized === 'TRUE' || normalized === 'T' || normalized === 'SI';
  }

  private normalizeSelectKey(value: unknown): string {
    return String(value ?? '').trim().toUpperCase();
  }

  private resolveOptionValue(options: SelectOption[], preferred: unknown, fallbackLabel?: unknown): string {
    const preferredKey = this.normalizeSelectKey(preferred);
    const fallbackKey = this.normalizeSelectKey(fallbackLabel);

    if (preferredKey) {
      const byValue = options.find((item) => this.normalizeSelectKey(item.value) === preferredKey);
      if (byValue) {
        return byValue.value;
      }

      const byLabel = options.find((item) => this.normalizeSelectKey(item.label) === preferredKey);
      if (byLabel) {
        return byLabel.value;
      }
    }

    if (fallbackKey) {
      const byFallbackValue = options.find((item) => this.normalizeSelectKey(item.value) === fallbackKey);
      if (byFallbackValue) {
        return byFallbackValue.value;
      }

      const byFallbackLabel = options.find((item) => this.normalizeSelectKey(item.label) === fallbackKey);
      if (byFallbackLabel) {
        return byFallbackLabel.value;
      }
    }

    return String(preferred ?? '').trim();
  }

  tryAutogenerarCodigo() {
    if (this.isEditMode() || this.articuloForm.controls.Modificar.value === 1) {
      return;
    }

    let tipoArticulo = String(this.articuloForm.controls.TipoArticulo.value ?? '').trim();
    let grupo = String(this.articuloForm.controls.GrupoInventario1.value ?? '').trim();
    let subGrupo = String(this.articuloForm.controls.GrupoInventario2.value ?? '').trim();

    if (!tipoArticulo) {
      tipoArticulo = this.getDefaultTipoArticulo();
      if (tipoArticulo) {
        this.articuloForm.controls.TipoArticulo.patchValue(tipoArticulo, { emitEvent: false });
      }
    }

    if (!grupo) {
      grupo = this.grupoInventarioOptions()[0]?.value ?? '';
      if (grupo) {
        this.articuloForm.controls.GrupoInventario1.patchValue(grupo, { emitEvent: false });
      }
    }

    if (!subGrupo) {
      subGrupo = this.subGrupoInventarioOptions()[0]?.value ?? '';
      if (subGrupo) {
        this.articuloForm.controls.GrupoInventario2.patchValue(subGrupo, { emitEvent: false });
      }
    }

    if (!tipoArticulo || !grupo || !subGrupo) {
      this.articuloForm.patchValue({ Articulo: '' }, { emitEvent: false });
      return;
    }

    this.articulosService.getCodigoAutogenerado(tipoArticulo, grupo, subGrupo).subscribe({
      next: (codigo) => {
        if (!codigo) {
          return;
        }

        if (this.isEditMode() || this.articuloForm.controls.Modificar.value === 1) {
          return;
        }

        this.articuloForm.patchValue({ Articulo: codigo }, { emitEvent: false });
      },
      error: () => {
        this.errorMessage.set('No se pudo autogenerar el código del artículo.');
      }
    });
  }

  filteredArticulos = computed(() => {
    const term = this.filterText().trim().toLowerCase();
    if (!term) return this.articulos();

    return this.articulos().filter((item) => {
      return (
        item.Articulo.toLowerCase().includes(term) ||
        item.Descripcion.toLowerCase().includes(term) ||
        item.TipoArticulo.toLowerCase().includes(term)
      );
    });
  });

  // Paginado sobre filteredArticulos: evita renderizar (y, con "Ver imágenes" activo,
  // descargar) el catálogo completo de una vez -- en catalogos grandes (parrot: ~1100
  // articulos, ~99% con foto) marcar el checkbox sin paginar disparaba una foto por
  // articulo simultaneamente.
  articulosPaginados = computed(() => {
    const inicio = this.paginaActual() * this.filasPorPagina();
    return this.filteredArticulos().slice(inicio, inicio + this.filasPorPagina());
  });

  onPageChange(event: PaginatorState): void {
    this.paginaActual.set(event.page ?? 0);
    this.filasPorPagina.set(event.rows ?? 25);
  }

  onFilterChange(value: string) {
    this.filterText.set(value);
    this.paginaActual.set(0);
  }

  toggleVerImagenes(checked: boolean): void {
    this.verImagenes.set(checked);
  }

  getArticuloImagenUrl(codigo: string): string | null {
    if (!this.verImagenes()) return null;
    const url = this.articuloImagenesUrls()[codigo];
    if (url) return url;
    if (!this.loadingArticuloImageCodes.has(codigo)) {
      this.cargarImagenArticulo(codigo);
    }
    return null;
  }

  private cargarImagenArticulo(codigo: string): void {
    this.loadingArticuloImageCodes.add(codigo);
    this.articulosService.getArticuloImagen(codigo).pipe(
      map(blob => URL.createObjectURL(blob)),
      catchError(() => of(null)),
      finalize(() => this.loadingArticuloImageCodes.delete(codigo))
    ).subscribe(url => {
      if (url) {
        this.articuloImagenesUrls.update(prev => ({ ...prev, [codigo]: url }));
      }
    });
  }

  cancelarExportacion(): void {
    this.cancelExportRequested = true;
    this.exportProgresoTexto.set('Cancelando exportación...');
  }

  async exportarExcel() {
    const list = this.itemsParaExportar();
    if (!list || list.length === 0) {
      this.messageService.add({ severity: 'info', summary: 'Sin datos', detail: 'No hay artículos para exportar.' });
      return;
    }

    try {
      const XLSX = await import('xlsx');
      const rows = list.map(item => ({
        'Artículo': item.Articulo,
        'Descripción': item.Descripcion,
        'Grupo': item.GrupoInventario || 'Sin Grupo',
        'Tipo Artículo': item.TipoArticulo,
        'Precio': Number(item.UltimoPrecio || 0),
        'Disponible': item.Activo ? 'Sí' : 'No'
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Catálogo');
      XLSX.writeFile(workbook, `Catalogo_Articulos_${new Date().toISOString().slice(0, 10)}.xlsx`);
      this.messageService.add({ severity: 'success', summary: 'Éxito', detail: 'Catálogo exportado a Excel.' });
      this.showPdfDialog.set(false);
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo generar el archivo Excel.' });
    }
  }

  async ejecutarExportarPdf(conImagenes: boolean) {
    const list = this.itemsParaExportar();
    if (!list || list.length === 0) {
      this.messageService.add({ severity: 'info', summary: 'Sin datos', detail: 'No hay artículos para exportar.' });
      this.showPdfDialog.set(false);
      return;
    }

    // Si es con fotos, cerramos el diálogo inmediatamente y procesamos en segundo plano
    if (conImagenes) {
      this.showPdfDialog.set(false);
      this.exportandoEnSegundoPlano.set(true);
      this.cancelExportRequested = false;
      this.exportProgresoTexto.set('Iniciando exportación con imágenes...');
    } else {
      this.exportandoPdf.set(true);
    }

    try {
      const [{ default: JsPdf }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable')
      ]);

      const doc = new JsPdf({ orientation: 'portrait', unit: 'pt', format: 'a4' });

      doc.setFontSize(14);
      doc.text('Catálogo de Artículos', 40, 40);
      doc.setFontSize(9);
      const grupoText = this.exportGrupoFiltro() ? `Grupo: ${this.exportGrupoFiltro()}   |   ` : '';
      doc.text(`${grupoText}Fecha de exportación: ${new Date().toLocaleDateString('es-SV')}   |   Total artículos: ${list.length}`, 40, 56);

      const imageMap: Record<string, string> = {};

      if (conImagenes) {
        const articulosConImg = list.filter(a => a.TieneImagen);
        const totalConImg = articulosConImg.length;
        const batchSize = 5;

        for (let i = 0; i < totalConImg; i += batchSize) {
          if (this.cancelExportRequested) {
            this.messageService.add({ severity: 'info', summary: 'Cancelado', detail: 'La exportación fue cancelada.' });
            this.exportandoEnSegundoPlano.set(false);
            return;
          }

          const batch = articulosConImg.slice(i, i + batchSize);
          this.exportProgresoTexto.set(`Descargando fotos: ${Math.min(i + batchSize, totalConImg)} de ${totalConImg}...`);

          await Promise.all(batch.map(async (art) => {
            try {
              const blob = await firstValueFrom(this.articulosService.getArticuloImagen(art.Articulo));
              const dataUrl = await this.blobToDataUrl(blob);
              imageMap[art.Articulo] = dataUrl;
            } catch {}
          }));

          // Yield al event loop para que el usuario pueda trabajar libremente
          await new Promise(resolve => setTimeout(resolve, 15));
        }

        this.exportProgresoTexto.set('Generando documento PDF...');
      }

      const headers = conImagenes
        ? [['Img', 'Artículo', 'Descripción', 'Grupo', 'Tipo', 'Precio', 'Estado']]
        : [['Artículo', 'Descripción', 'Grupo', 'Tipo', 'Precio', 'Estado']];

      const body = list.map(item => {
        const row = [
          item.Articulo,
          item.Descripcion,
          item.GrupoInventario || '-',
          item.TipoArticulo,
          `$${Number(item.UltimoPrecio || 0).toFixed(2)}`,
          item.Activo ? 'Activo' : 'Inactivo'
        ];
        return conImagenes ? ['', ...row] : row;
      });

      autoTable(doc, {
        startY: 68,
        head: headers,
        body: body,
        styles: { fontSize: 8, cellPadding: conImagenes ? 2 : 4 },
        headStyles: { fillColor: [37, 99, 235], textColor: 255 },
        columnStyles: conImagenes ? {
          0: { cellWidth: 32, minCellHeight: 30 },
          5: { halign: 'right' },
          6: { halign: 'center' }
        } : {
          4: { halign: 'right' },
          5: { halign: 'center' }
        },
        margin: { left: 40, right: 40 },
        didDrawCell: (data) => {
          if (conImagenes && data.section === 'body' && data.column.index === 0) {
            const item = list[data.row.index];
            const base64 = imageMap[item.Articulo];
            if (base64) {
              try {
                doc.addImage(base64, 'JPEG', data.cell.x + 3, data.cell.y + 3, 24, 24);
              } catch {}
            }
          }
        }
      });

      doc.save(`catalogo_articulos_${new Date().toISOString().slice(0, 10)}.pdf`);
      this.messageService.add({ severity: 'success', summary: 'Éxito', detail: 'Catálogo exportado a PDF.' });
      this.showPdfDialog.set(false);
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo generar el PDF del catálogo.' });
    } finally {
      this.exportandoPdf.set(false);
      this.exportandoEnSegundoPlano.set(false);
    }
  }

  private blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  detailTitle = computed(() => (this.isEditMode() ? 'Editar Artículo' : 'Nuevo Artículo'));
  modoMttoTexto = computed(() => (this.isModoEdicionValue() ? 'Edición' : 'Alta'));
  accionGuardarTexto = computed(() => (this.isModoEdicionValue() ? 'Actualizar' : 'Guardar'));

  articuloForm = this.fb.group({
    Articulo: ['', [Validators.required]],
    Descripcion: ['', [Validators.required]],
    UltimoPrecio: this.fb.control(0, { nonNullable: true }),
    TipoArticulo: ['', [Validators.required]],
    Activo: this.fb.control(true, { nonNullable: true }),
    MetodoCosteoInterno: ['PR'],
    UnidadMedida: [''],
    GrupoInventario1: [''],
    GrupoInventario2: [''],
    GrupoInventario3: [''],
    GrupoInventario4: [''],
    GrupoInventario5: [''],
    ArticuloCuenta: ['NA'],
    ArticuloCtaCrudo: [''],
    ArticuloCtaTerminado: [''],
    Color: [''],
    Acabado: [''],
    Peso: this.fb.control(0, { nonNullable: true }),
    Ancho: this.fb.control(0, { nonNullable: true }),
    Rendimiento: this.fb.control(0, { nonNullable: true }),
    Modificar: this.fb.control(0, { nonNullable: true }),
    BodegaSelected: [''],
    ExistenciaMinima: this.fb.control(0, { nonNullable: true }),
    ExistenciaMaxima: this.fb.control(99999, { nonNullable: true }),
    ImpuestoSelected: [''],
    DescuentoValor: ['0'],
    DescuentoTipo: this.fb.control<'P' | 'M'>('P', { nonNullable: true }),
    DescuentoActivo: this.fb.control(true, { nonNullable: true })
  });

  grupoDialogForm = this.fb.group({
    GpoInventario: ['', [Validators.required]],
    Descripcion: ['', [Validators.required]]
  });

  // ── Artículos Compuestos (CM) ───────────────────────────────────────────────
  componentes = signal<ArticuloComponenteDto[]>([]);
  articulosTmOptions = signal<ArticuloTmCatalogoDto[]>([]);
  loadingTmOptions = signal(false);
  componenteSelected = signal<string>('');
  componenteCantidad = signal<number>(1);
  selectedTipoArticulo = signal<string>('');

  isCompuesto = computed(() => {
    return this.selectedTipoArticulo().trim().toUpperCase() === 'CM';
  });

  articulosTmSelectOptions = computed(() => {
    const selectedHijos = new Set(this.componentes().map((c) => c.ArticuloHijo));
    const currentCode = String(this.articuloForm?.controls?.Articulo?.value ?? '').trim();
    return this.articulosTmOptions()
      .filter((item) => !selectedHijos.has(item.Articulo) && item.Articulo !== currentCode)
      .map((item) => ({
        value: item.Articulo,
        label: `${item.Articulo} - ${item.Descripcion} (${item.UnidadMedida || 'UND'})`
      }));
  });
  // ────────────────────────────────────────────────────────────────────────────

  constructor() {
    this.loadCatalogos();
    this.loadArticulos();

    this.articuloForm.controls.TipoArticulo.valueChanges.subscribe((tipo) => {
      this.selectedTipoArticulo.set(String(tipo ?? ''));
      this.handleTipoArticuloChange(tipo);
    });
  }

  private showSuccess(summary: string, detail: string) {
    this.messageService.add({ severity: 'info', summary, detail });
  }

  private showError(summary: string, detail: string) {
    this.messageService.add({ severity: 'error', summary, detail });
  }

  loadArticulosTM() {
    if (this.articulosTmOptions().length > 0 || this.loadingTmOptions()) {
      return;
    }
    this.loadingTmOptions.set(true);
    this.articulosService
      .getArticulosTM()
      .pipe(finalize(() => this.loadingTmOptions.set(false)))
      .subscribe({
        next: (rows) => this.articulosTmOptions.set(rows ?? []),
        error: () => this.showError('Artículos TM', 'No se pudo cargar el catálogo de artículos terminados.')
      });
  }

  syncActivoStateForCompuesto() {
    if (this.isCompuesto()) {
      if (this.componentes().length < 2) {
        this.articuloForm.controls.Activo.setValue(false, { emitEvent: false });
        this.articuloForm.controls.Activo.disable({ emitEvent: false });
      } else {
        this.articuloForm.controls.Activo.enable({ emitEvent: false });
      }
    } else {
      this.articuloForm.controls.Activo.enable({ emitEvent: false });
    }
  }

  handleTipoArticuloChange(tipo: string | null) {
    const isCm = String(tipo ?? '').trim().toUpperCase() === 'CM';
    if (isCm) {
      this.loadArticulosTM();
      this.syncActivoStateForCompuesto();
    } else {
      this.articuloForm.controls.Activo.enable({ emitEvent: false });
    }
  }

  addComponente() {
    const codHijo = String(this.componenteSelected() ?? '').trim();
    const cant = Number(this.componenteCantidad() ?? 0);
    if (!codHijo || cant <= 0) {
      this.showError('Componentes', 'Seleccione un artículo TM y especifique una cantidad válida mayor a 0.');
      return;
    }

    const tm = this.articulosTmOptions().find((x) => x.Articulo === codHijo);
    if (!tm) return;

    const exists = this.componentes().some((c) => c.ArticuloHijo === codHijo);
    if (exists) {
      this.showError('Componentes', 'El artículo seleccionado ya forma parte de los componentes.');
      return;
    }

    const newComp: ArticuloComponenteDto = {
      ArticuloPadre: this.currentArticuloCode(),
      ArticuloHijo: tm.Articulo,
      Descripcion: tm.Descripcion,
      UnidadMedida: tm.UnidadMedida || 'UND',
      Cantidad: cant
    };

    const updated = [...this.componentes(), newComp];
    this.componentes.set(updated);
    this.componenteSelected.set('');
    this.componenteCantidad.set(1);
    this.syncActivoStateForCompuesto();

    if (this.isEditMode()) {
      const padre = this.currentArticuloCode();
      if (padre) {
        this.articulosService
          .saveComponentes({
            ArticuloPadre: padre,
            Componentes: updated.map((c) => ({ ArticuloHijo: c.ArticuloHijo, Cantidad: c.Cantidad }))
          })
          .subscribe({
            next: (res) => {
              this.showSuccess('Componentes', 'Componente agregado correctamente.');
              if (res.activo !== undefined) {
                this.articuloForm.patchValue({ Activo: res.activo }, { emitEvent: false });
                this.syncActivoStateForCompuesto();
              }
            },
            error: () => {
              this.showError('Componentes', 'No se pudo guardar el componente en el servidor.');
            }
          });
      }
    } else {
      this.showSuccess('Componentes', 'Componente agregado. Se guardará con el artículo.');
    }
  }

  removeComponente(codHijo: string) {
    const updated = this.componentes().filter((c) => c.ArticuloHijo !== codHijo);
    this.componentes.set(updated);
    this.syncActivoStateForCompuesto();

    if (this.isEditMode()) {
      const padre = this.currentArticuloCode();
      if (padre) {
        this.articulosService
          .saveComponentes({
            ArticuloPadre: padre,
            Componentes: updated.map((c) => ({ ArticuloHijo: c.ArticuloHijo, Cantidad: c.Cantidad }))
          })
          .subscribe({
            next: (res) => {
              this.showSuccess('Componentes', 'Componente eliminado correctamente.');
              if (res.activo !== undefined) {
                this.articuloForm.patchValue({ Activo: res.activo }, { emitEvent: false });
                this.syncActivoStateForCompuesto();
              }
            },
            error: () => {
              this.showError('Componentes', 'No se pudo eliminar el componente en el servidor.');
            }
          });
      }
    } else {
      this.showSuccess('Componentes', 'Componente removido de la captura actual.');
    }
  }

  loadArticulos() {
    this.loadingList.set(true);
    this.errorMessage.set('');

    this.articulosService
      .getArticulos()
      .pipe(finalize(() => this.loadingList.set(false)))
      .subscribe({
        next: (rows) => {
          this.articulos.set(rows ?? []);
          this.paginaActual.set(0);
        },
        error: () => this.errorMessage.set('No se pudo cargar el catálogo de artículos.')
      });
  }

  private loadCatalogos() {
    this.articulosService.getCatalogoImpuestos().subscribe({
      next: (rows) => {
        const options = (rows ?? []).map((item) => ({ value: item.Impuesto, label: item.Nombre || item.Impuesto }));
        this.impuestoOptions.set(options);

        if (!this.isEditMode()) {
          const selected = String(this.articuloForm.controls.ImpuestoSelected.value ?? '').trim();
          if (!selected) {
            this.articuloForm.patchValue({ ImpuestoSelected: this.getDefaultImpuestoValue() }, { emitEvent: false });
          }
        }
      }
    });

    this.articulosService.getCatalogoBodegas().subscribe({
      next: (rows) => {
        this.bodegaOptions.set(
          (rows ?? []).map((item) => ({ value: item.Bodega, label: item.Descripcion || item.Bodega }))
        );
      }
    });

    this.articulosService.getCatalogoTipoArticulo().subscribe({
      next: (rows) => {
        this.tipoArticuloOptions.set(
          (rows ?? [])
            .filter((item) => item.TipoArticulo !== 'VN' && !item.Descripcion.toUpperCase().includes('PERECEDERO'))
            .map((item) => ({ value: item.TipoArticulo, label: item.Descripcion || item.TipoArticulo }))
        );
        this.ensureDefaultSelectionsForCreate();
      }
    });

    this.articulosService.getCatalogoUnidadMedida().subscribe({
      next: (rows) => {
        this.unidadMedidaOptions.set(
          (rows ?? []).map((item) => ({ value: item.UnidadMedida, label: item.Descripcion || item.UnidadMedida }))
        );
      }
    });

    this.refreshGrupoInventarioOptions(1);
    this.refreshGrupoInventarioOptions(2);
  }

  private refreshGrupoInventarioOptions(nivel: 1 | 2, selectedValue?: string) {
    this.articulosService.getGruposInventarioPorNivel(nivel).subscribe({
      next: (rows) => {
        const options = (rows ?? []).map((item) => ({
          value: item.GrupoInventario,
          label: item.Descripcion || item.GrupoInventario
        }));

        if (nivel === 1) {
          this.grupoInventarioOptions.set(options);
        } else {
          this.subGrupoInventarioOptions.set(options);
        }

        const control = nivel === 1 ? this.articuloForm.controls.GrupoInventario1 : this.articuloForm.controls.GrupoInventario2;
        const current = String(control.value ?? '').trim();
        const target = String(selectedValue ?? current).trim();
        if (target) {
          const exists = options.some((item) => item.value === target);
          control.patchValue(exists ? target : (options[0]?.value ?? ''), { emitEvent: false });
        } else if (options[0]?.value) {
          control.patchValue(options[0].value, { emitEvent: false });
        }

        this.ensureDefaultSelectionsForCreate();
      },
      error: () => {
        if (nivel === 1) {
          this.grupoInventarioOptions.set([]);
          this.showError('Artículos', 'No se pudo cargar el catálogo de grupos de inventario.');
          return;
        }

        this.subGrupoInventarioOptions.set([]);
        this.showError('Artículos', 'No se pudo cargar el catálogo de subgrupos de inventario.');
      }
    });
  }

  private ensureDefaultSelectionsForCreate() {
    if (!this.showDetail() || this.isModoEdicionValue()) {
      return;
    }

    const tipo = String(this.articuloForm.controls.TipoArticulo.value ?? '').trim();
    const grupo1 = String(this.articuloForm.controls.GrupoInventario1.value ?? '').trim();
    const grupo2 = String(this.articuloForm.controls.GrupoInventario2.value ?? '').trim();

    if (!tipo) {
      const defaultTipo = this.getDefaultTipoArticulo();
      if (defaultTipo) {
        this.articuloForm.controls.TipoArticulo.patchValue(defaultTipo, { emitEvent: false });
      }
    }

    if (!grupo1 && this.grupoInventarioOptions()[0]?.value) {
      this.articuloForm.controls.GrupoInventario1.patchValue(this.grupoInventarioOptions()[0].value, { emitEvent: false });
    }

    if (!grupo2 && this.subGrupoInventarioOptions()[0]?.value) {
      this.articuloForm.controls.GrupoInventario2.patchValue(this.subGrupoInventarioOptions()[0].value, { emitEvent: false });
    }

    this.tryAutogenerarCodigo();
  }

  openGrupoInventarioDialog(nivel: 1 | 2) {
    this.showGrupoDialog.set(true);
    this.grupoDialogNivel.set(nivel);
    this.grupoDialogSelectedCode.set('');
    this.grupoDialogForm.reset({ GpoInventario: '', Descripcion: '' });
    this.loadGrupoInventarioDialogRows();
    if (nivel === 1) {
      this.cargarPuntosVentaGrupo('');
    } else {
      this.grupoDialogPuntosVenta.set([]);
    }
  }

  closeGrupoInventarioDialog(refreshOptions: boolean = false, selectedValue: string = '') {
    const nivel = this.grupoDialogNivel();
    this.showGrupoDialog.set(false);
    this.grupoDialogLoading.set(false);
    this.grupoDialogSaving.set(false);
    this.grupoDialogRows.set([]);
    this.grupoDialogSelectedCode.set('');
    this.grupoDialogPuntosVenta.set([]);
    this.grupoDialogPvLoading.set(false);
    this.grupoDialogForm.reset({ GpoInventario: '', Descripcion: '' });

    if (!refreshOptions) {
      return;
    }

    this.refreshGrupoInventarioOptions(nivel, selectedValue);
  }

  private loadGrupoInventarioDialogRows(selectedValue: string = '') {
    this.grupoDialogLoading.set(true);
    const nivel = this.grupoDialogNivel();
    this.articulosService
      .getGruposInventarioPorNivel(nivel)
      .pipe(finalize(() => this.grupoDialogLoading.set(false)))
      .subscribe({
        next: (rows) => {
          const normalizedRows = [...(rows ?? [])].sort((a, b) => a.GrupoInventario.localeCompare(b.GrupoInventario));
          this.grupoDialogRows.set(normalizedRows);
          const toSelect = String(selectedValue || this.grupoDialogSelectedCode() || '').trim();
          if (!toSelect) {
            return;
          }

          const row = normalizedRows.find((item) => item.GrupoInventario === toSelect);
          if (row) {
            this.selectGrupoInventarioDialogRow(row);
          }
        },
        error: () => {
          this.grupoDialogRows.set([]);
          this.showError('Grupos', 'No se pudo cargar el listado de grupos/subgrupos.');
        }
      });
  }

  selectGrupoInventarioDialogRow(row: GrupoInventarioConsultaDto) {
    this.grupoDialogSelectedCode.set(row.GrupoInventario);
    this.grupoDialogForm.patchValue({
      GpoInventario: row.GrupoInventario,
      Descripcion: row.Descripcion
    });
    if (this.grupoDialogNivel() === 1) {
      this.cargarPuntosVentaGrupo(row.GrupoInventario);
    }
  }

  newGrupoInventarioDialog() {
    this.grupoDialogSelectedCode.set('');
    this.grupoDialogForm.reset({ GpoInventario: '', Descripcion: '' });
    if (this.grupoDialogNivel() === 1) {
      this.cargarPuntosVentaGrupo('');
    }
  }

  cargarPuntosVentaGrupo(grupo: string = '') {
    this.grupoDialogPvLoading.set(true);
    this.articulosService
      .getPuntosVentaPorGrupo(grupo)
      .pipe(finalize(() => this.grupoDialogPvLoading.set(false)))
      .subscribe({
        next: (rows) => this.grupoDialogPuntosVenta.set(rows ?? []),
        error: () => this.grupoDialogPuntosVenta.set([])
      });
  }

  togglePuntoVentaAsignacion(pv: PuntoVentaGrupoItemDto) {
    this.grupoDialogPuntosVenta.update((list) =>
      list.map((item) =>
        item.Sucursal === pv.Sucursal && item.PuntoVenta === pv.PuntoVenta
          ? { ...item, Asignado: !item.Asignado }
          : item
      )
    );
  }

  saveGrupoInventarioDialog() {
    if (this.grupoDialogForm.invalid) {
      this.grupoDialogForm.markAllAsTouched();
      return;
    }

    const code = String(this.grupoDialogForm.controls.GpoInventario.value ?? '').trim();
    const descripcion = String(this.grupoDialogForm.controls.Descripcion.value ?? '').trim();
    const nivel = this.grupoDialogNivel();
    const usuario = this.authService.currentUser()?.username ?? 'WEB';
    const isModify = this.grupoDialogSelectedCode() === code;

    const payload: GrupoInventarioUpdateDto = {
      GpoInventario: code,
      Descripcion: descripcion,
      Nivel: nivel,
      Usuario: usuario,
      Modificar: isModify ? 1 : 0,
      PuntosVenta: nivel === 1 ? this.grupoDialogPuntosVenta().map((p) => ({
        Sucursal: p.Sucursal,
        PuntoVenta: p.PuntoVenta,
        Asignado: p.Asignado
      })) : undefined
    };

    this.grupoDialogSaving.set(true);
    this.articulosService
      .updateGrupoInventario(payload)
      .pipe(finalize(() => this.grupoDialogSaving.set(false)))
      .subscribe({
        next: () => {
          if (isModify) {
            this.showSuccess('Grupos', 'Registro actualizado correctamente.');
            this.loadGrupoInventarioDialogRows(code);
            this.refreshGrupoInventarioOptions(nivel, code);
            return;
          }

          this.showSuccess('Grupos', 'Registro creado correctamente.');
          this.closeGrupoInventarioDialog(true, code);
        },
        error: () => {
          this.showError('Grupos', 'No se pudo guardar el registro. Verifica los datos e intenta nuevamente.');
        }
      });
  }

  deleteGrupoInventarioDialog(row: GrupoInventarioConsultaDto) {
    const confirmed = window.confirm(`¿Desea eliminar ${row.GrupoInventario}?`);
    if (!confirmed) {
      return;
    }

    this.articulosService.deleteGrupoInventario({ GpoInventario: row.GrupoInventario }).subscribe({
      next: () => {
        this.showSuccess('Grupos', 'Registro eliminado correctamente.');
        const selectedNivel = this.grupoDialogNivel();
        const currentControl =
          selectedNivel === 1 ? this.articuloForm.controls.GrupoInventario1 : this.articuloForm.controls.GrupoInventario2;

        if (String(currentControl.value ?? '').trim() === row.GrupoInventario) {
          currentControl.patchValue('', { emitEvent: false });
        }

        if (this.grupoDialogSelectedCode() === row.GrupoInventario) {
          this.newGrupoInventarioDialog();
        }

        this.loadGrupoInventarioDialogRows();
        this.refreshGrupoInventarioOptions(selectedNivel);
      },
      error: () => {
        this.showError('Grupos', 'No se pudo eliminar el registro seleccionado.');
      }
    });
  }

  openCreate() {
    this.showDetail.set(true);
    this.isEditMode.set(false);
    this.successMessage.set('');
    this.errorMessage.set('');

    this.articuloForm.reset({
      Articulo: '',
      Descripcion: '',
      UltimoPrecio: 0,
      TipoArticulo: this.getDefaultTipoArticulo(),
      Activo: true,
      MetodoCosteoInterno: 'PR',
      UnidadMedida: 'UND',
      GrupoInventario1: this.grupoInventarioOptions()[0]?.value ?? '',
      GrupoInventario2: this.subGrupoInventarioOptions()[0]?.value ?? '',
      GrupoInventario3: '',
      GrupoInventario4: '',
      GrupoInventario5: '',
      ArticuloCuenta: 'NA',
      ArticuloCtaCrudo: '',
      ArticuloCtaTerminado: '',
      Color: '',
      Acabado: '',
      Peso: 0,
      Ancho: 0,
      Rendimiento: 0,
      Modificar: 0,
      BodegaSelected: 'BOD01',
      ExistenciaMinima: 0,
      ExistenciaMaxima: 99999,
      ImpuestoSelected: this.getDefaultImpuestoValue(),
      DescuentoValor: '0',
      DescuentoTipo: 'P',
      DescuentoActivo: true
    });

    this.impuestosDetalle.set([]);
    this.bodegasDetalle.set([this.buildDefaultBodega()]);
    this.descuentosDetalle.set([]);
    this.componentes.set([]);
    this.componenteSelected.set('');
    this.componenteCantidad.set(1);
    this.selectedTipoArticulo.set(this.getDefaultTipoArticulo());
    this.syncActivoStateForCompuesto();
    this.revocarPreviewSiEsObjectUrl();
    this.imagenPreview.set(null);
    this.imagenPendiente.set(null);

    this.ensureDefaultSelectionsForCreate();

    Promise.resolve().then(() => {
      this.ensureDefaultSelectionsForCreate();
    });
  }

  openEdit(item: ArticuloDto) {
    this.showDetail.set(true);
    this.isEditMode.set(true);
    this.loadingDetail.set(true);
    this.successMessage.set('');
    this.errorMessage.set('');

    this.articulosService
      .getArticulo(item.Articulo)
      .pipe(finalize(() => this.loadingDetail.set(false)))
      .subscribe({
        next: (detalle) => {
          this.patchDetalle(detalle);
          this.cargarImagenExistente(item.Articulo, true);
        },
        error: () => this.errorMessage.set('No se pudo cargar el detalle del artículo.')
      });
  }

  private patchDetalle(detalle: ArticuloDetalleDto) {
    const tipoArticuloValue = this.resolveOptionValue(this.tipoArticuloOptions(), detalle.TipoArticulo);
    const unidadMedidaValue = this.resolveOptionValue(this.unidadMedidaOptions(), detalle.UnidadMedida);
    const grupo1Value = this.resolveOptionValue(this.grupoInventarioOptions(), detalle.GrupoInventario1, detalle.Des1);
    const grupo2Value = this.resolveOptionValue(this.subGrupoInventarioOptions(), detalle.GrupoInventario2, detalle.Des2);

    this.articuloForm.patchValue({
      Articulo: detalle.Articulo,
      Descripcion: detalle.Descripcion,
      UltimoPrecio: 0,
      TipoArticulo: tipoArticuloValue,
      Activo: this.toBoolean(detalle.Activo),
      MetodoCosteoInterno: 'PR',
      UnidadMedida: unidadMedidaValue,
      GrupoInventario1: grupo1Value,
      GrupoInventario2: grupo2Value,
      GrupoInventario3: detalle.GrupoInventario3,
      GrupoInventario4: detalle.GrupoInventario4,
      GrupoInventario5: detalle.GrupoInventario5,
      ArticuloCuenta: detalle.ArticuloCuenta || 'NA',
      ArticuloCtaCrudo: detalle.ArticuloCtaCrudo,
      ArticuloCtaTerminado: detalle.ArticuloCtaTerminado,
      Color: detalle.Color,
      Acabado: detalle.Acabado,
      Peso: detalle.Peso,
      Ancho: detalle.Ancho,
      Rendimiento: detalle.Rendimiento,
      Modificar: 1,
      BodegaSelected: 'BOD01',
      ExistenciaMinima: 0,
      ExistenciaMaxima: 99999,
      ImpuestoSelected: detalle.Impuestos?.[0]?.Impuesto ?? this.getDefaultImpuestoValue(),
      DescuentoValor: '0',
      DescuentoTipo: 'P',
      DescuentoActivo: true
    });

    this.impuestosDetalle.set(detalle.Impuestos ?? []);
    this.bodegasDetalle.set((detalle.Bodegas ?? []).length > 0 ? (detalle.Bodegas ?? []) : [this.buildDefaultBodega()]);
    this.descuentosDetalle.set(detalle.Descuentos ?? []);
    this.selectedTipoArticulo.set(tipoArticuloValue);
    this.componentes.set(detalle.Componentes ?? []);
    if (String(tipoArticuloValue ?? '').trim().toUpperCase() === 'CM') {
      this.loadArticulosTM();
    }
    this.syncActivoStateForCompuesto();
  }

  private buildDefaultBodega(): ArticuloBodegaDto {
    return {
      Bodega: 'BOD01',
      Descripcion: 'BOD01',
      ExistenciaMinima: 0,
      ExistenciaMaxima: 99999
    };
  }

  private ensureDefaultBodega(): void {
    if (this.bodegasDetalle().length > 0) {
      return;
    }

    this.bodegasDetalle.set([this.buildDefaultBodega()]);
  }

  private currentArticuloCode(): string {
    return String(this.articuloForm.controls.Articulo.value ?? '').trim();
  }

  private toDecimal(value: string | number | null | undefined): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private persistPendingDetailRows(articulo: string, usuario: string) {
    const shouldIgnoreDetailPersistError = (error: unknown) => {
      if (!(error instanceof HttpErrorResponse)) {
        return false;
      }

      if (error.status === 409) {
        return true;
      }

      const rawError = error.error;
      const message =
        typeof rawError === 'string'
          ? rawError
          : String((rawError as { message?: unknown })?.message ?? '');
      const normalized = message.toLowerCase();

      return normalized.includes('existe') || normalized.includes('duplic') || normalized.includes('ya fue agregado');
    };

    for (const row of this.bodegasDetalle()) {
      this.articulosService
        .updateArticuloBodega({
          Articulo: articulo,
          Bodega: row.Bodega,
          ExistenciaMinima: row.ExistenciaMinima,
          ExistenciaMaxima: row.ExistenciaMaxima,
          Usuario: usuario
        })
        .subscribe({
          error: (error) => {
            if (shouldIgnoreDetailPersistError(error)) {
              return;
            }

            this.showError('Bodegas', `No se pudo guardar la bodega ${row.Bodega}.`);
          }
        });
    }

    for (const row of this.impuestosDetalle()) {
      this.articulosService
        .updateArticuloImpuesto({
          Articulo: articulo,
          Impuesto: row.Impuesto,
          Usuario: usuario
        })
        .subscribe({
          error: (error) => {
            if (shouldIgnoreDetailPersistError(error)) {
              return;
            }

            this.showError('Impuestos', `No se pudo guardar el impuesto ${row.Impuesto}.`);
          }
        });
    }

    for (const row of this.descuentosDetalle()) {
      const payload: ArticuloDescuentoUpdateDto = {
        IdArticuloDescuento: 0,
        Articulo: articulo,
        TipoDescuento: row.TipoDescuento ?? 'P',
        ValorDescuento: this.toDecimal(row.Descuento),
        Usuario: usuario,
        Activo: row.Activo,
        TipoMtto: 'A'
      };

      this.articulosService.updateArticuloDescuento(payload).subscribe({
        error: () => this.showError('Descuentos', 'No se pudo guardar un descuento pendiente del artículo.')
      });
    }
  }

  closeDetail() {
    this.showDetail.set(false);
    this.isEditMode.set(false);
    this.loadingDetail.set(false);
    this.revocarPreviewSiEsObjectUrl();
    this.imagenPreview.set(null);
    this.imagenPendiente.set(null);
    this.componentes.set([]);
    this.componenteSelected.set('');
    this.componenteCantidad.set(1);
  }

  deleteArticulo(item: ArticuloDto) {
    const codigo = item.Articulo;
    const confirmed = window.confirm(`¿Desea eliminar el artículo ${codigo}?`);
    if (!confirmed) {
      return;
    }
this.articulosService.deleteArticulo(codigo).subscribe({
  next: () => {
    this.articulos.update((rows) => rows.filter((row) => row.Articulo !== codigo));
    this.showSuccess('Artículos', 'Artículo eliminado correctamente.');
  },
  error: (err) => {
    // 1. Extraer el mensaje del backend. 
    // Maneja diferentes formatos dependiendo de cómo ASP.NET Core serialice el 409 Conflict.
    let backendMessage = 'No se pudo eliminar el artículo.'; // Mensaje por defecto
    
    if (err.error) {
      if (typeof err.error === 'string') {
        // Si el API devuelve un string plano: return Conflict("MENSAJE");
        backendMessage = err.error;
      } else if (err.error.message) {
        // Si el API devuelve un JSON customizado
        backendMessage = err.error.message;
      } else if (err.error.title || err.error.detail) {
        // Si el API devuelve el estándar ProblemDetails de .NET Core
        backendMessage = err.error.detail || err.error.title;
      }
    }

    // 2. Mostrar el mensaje real en la interfaz
    this.errorMessage.set(backendMessage);
    this.showError('Artículos', backendMessage);
  }
});
  }

  isImpuestoSelected(impuesto: string): boolean {
    return this.impuestosDetalle().some((row) => row.Impuesto === impuesto);
  }

  onImpuestoTokenToggle(impuesto: string, checked: boolean): void {
    if (checked) {
      this.articuloForm.patchValue({ ImpuestoSelected: impuesto }, { emitEvent: false });
      this.addImpuesto();
      return;
    }

    this.removeImpuesto(impuesto);
  }

  addImpuesto() {
    this.errorMessage.set('');
    const impuesto = this.articuloForm.controls.ImpuestoSelected.value;
    if (!impuesto) return;

    const exists = this.impuestosDetalle().some((row) => row.Impuesto === impuesto);
    if (exists) return;

    const option = this.impuestoOptions().find((item) => item.value === impuesto);
    const newRow = { Impuesto: impuesto, Descripcion: option?.label ?? impuesto };
    this.impuestosDetalle.update((rows) => [...rows, newRow]);

    if (this.isEditMode()) {
      const articulo = this.currentArticuloCode();
      const usuario = this.authService.currentUser()?.username ?? 'WEB';

      if (!articulo) return;

      this.articulosService
        .updateArticuloImpuesto({ Articulo: articulo, Impuesto: impuesto, Usuario: usuario })
        .subscribe({
          next: () => this.showSuccess('Impuestos', 'Impuesto agregado correctamente.'),
          error: () => {
            this.impuestosDetalle.update((rows) => rows.filter((row) => row.Impuesto !== impuesto));
            this.errorMessage.set('No se pudo guardar el impuesto del artículo.');
            this.showError('Impuestos', 'No se pudo guardar el impuesto del artículo.');
          }
        });
    } else {
      this.showSuccess('Impuestos', 'Impuesto agregado. Se guardará al registrar el artículo.');
    }
  }

  removeImpuesto(impuesto: string) {
    const previousRows = this.impuestosDetalle();
    this.impuestosDetalle.set(previousRows.filter((row) => row.Impuesto !== impuesto));

    if (this.isEditMode()) {
      const articulo = this.currentArticuloCode();
      if (!articulo) return;

      this.articulosService.deleteArticuloImpuesto({ Articulo: articulo, Impuesto: impuesto }).subscribe({
        next: () => this.showSuccess('Impuestos', 'Impuesto eliminado correctamente.'),
        error: () => {
          this.impuestosDetalle.set(previousRows);
          this.errorMessage.set('No se pudo eliminar el impuesto del artículo.');
          this.showError('Impuestos', 'No se pudo eliminar el impuesto del artículo.');
        }
      });
    } else {
      this.showSuccess('Impuestos', 'Impuesto removido de la captura actual.');
    }
  }

  addBodega() {
    this.errorMessage.set('');
    const bodega = this.articuloForm.controls.BodegaSelected.value;
    if (!bodega) return;

    const exists = this.bodegasDetalle().some((row) => row.Bodega === bodega);
    if (exists) return;

    const option = this.bodegaOptions().find((item) => item.value === bodega);
    const newRow = {
      Bodega: bodega,
      Descripcion: option?.label ?? bodega,
      ExistenciaMinima: this.articuloForm.controls.ExistenciaMinima.value,
      ExistenciaMaxima: this.articuloForm.controls.ExistenciaMaxima.value
    };

    this.bodegasDetalle.update((rows) => [
      ...rows,
      newRow
    ]);

    if (this.isEditMode()) {
      const articulo = this.currentArticuloCode();
      const usuario = this.authService.currentUser()?.username ?? 'WEB';
      if (!articulo) return;

      this.articulosService
        .updateArticuloBodega({
          Articulo: articulo,
          Bodega: bodega,
          ExistenciaMinima: newRow.ExistenciaMinima,
          ExistenciaMaxima: newRow.ExistenciaMaxima,
          Usuario: usuario
        })
        .subscribe({
          next: () => this.showSuccess('Bodegas', 'Bodega agregada correctamente.'),
          error: () => {
            this.bodegasDetalle.update((rows) => rows.filter((row) => row.Bodega !== bodega));
            this.errorMessage.set('No se pudo guardar la bodega del artículo.');
            this.showError('Bodegas', 'No se pudo guardar la bodega del artículo.');
          }
        });
    } else {
      this.showSuccess('Bodegas', 'Bodega agregada. Se guardará al registrar el artículo.');
    }
  }

  removeBodega(bodega: string) {
    const previousRows = this.bodegasDetalle();
    this.bodegasDetalle.set(previousRows.filter((row) => row.Bodega !== bodega));

    if (this.isEditMode()) {
      const articulo = this.currentArticuloCode();
      if (!articulo) return;

      this.articulosService.deleteArticuloBodega({ Articulo: articulo, Bodega: bodega }).subscribe({
        next: () => this.showSuccess('Bodegas', 'Bodega eliminada correctamente.'),
        error: () => {
          this.bodegasDetalle.set(previousRows);
          this.errorMessage.set('No se pudo eliminar la bodega del artículo.');
          this.showError('Bodegas', 'No se pudo eliminar la bodega del artículo.');
        }
      });
    } else {
      this.showSuccess('Bodegas', 'Bodega removida de la captura actual.');
    }
  }

  addDescuento() {
    const descuento: ArticuloDescuentoDto = {
      IdArticuloDescuento: Date.now(),
      ArticuloDescripcion: this.articuloForm.controls.Descripcion.value ?? '',
      TipoDescuento: this.articuloForm.controls.DescuentoTipo.value,
      Descuento: this.articuloForm.controls.DescuentoValor.value ?? '0',
      Vigencia: new Date().toISOString().slice(0, 10),
      Activo: this.articuloForm.controls.DescuentoActivo.value ? 1 : 0,
      Articulo: this.articuloForm.controls.Articulo.value ?? '',
      FechaIngreso: new Date().toISOString()
    };

    this.descuentosDetalle.update((rows) => [...rows, descuento]);

    if (this.isEditMode()) {
      const articulo = this.currentArticuloCode();
      const usuario = this.authService.currentUser()?.username ?? 'WEB';
      if (!articulo) return;

      this.articulosService
        .updateArticuloDescuento({
          IdArticuloDescuento: 0,
          Articulo: articulo,
          TipoDescuento: descuento.TipoDescuento ?? 'P',
          ValorDescuento: this.toDecimal(descuento.Descuento),
          Usuario: usuario,
          Activo: descuento.Activo,
          TipoMtto: 'A'
        })
        .subscribe({
          next: () => {
            this.showSuccess('Descuentos', 'Descuento agregado correctamente.');
            this.articulosService.getArticulo(articulo).subscribe({
              next: (detalle) => this.patchDetalle(detalle)
            });
          },
          error: () => {
            this.errorMessage.set('No se pudo guardar el descuento del artículo.');
            this.showError('Descuentos', 'No se pudo guardar el descuento del artículo.');
          }
        });
    } else {
      this.showSuccess('Descuentos', 'Descuento agregado. Se guardará al registrar el artículo.');
    }
  }

  removeDescuento(idArticuloDescuento: number) {
    const selected = this.descuentosDetalle().find((row) => row.IdArticuloDescuento === idArticuloDescuento);
    if (!selected) return;

    const previousRows = this.descuentosDetalle();
    this.descuentosDetalle.set(previousRows.filter((row) => row.IdArticuloDescuento !== idArticuloDescuento));

    if (this.isEditMode()) {
      const articulo = this.currentArticuloCode();
      const usuario = this.authService.currentUser()?.username ?? 'WEB';
      if (!articulo) return;

      this.articulosService
        .updateArticuloDescuento({
          IdArticuloDescuento: selected.IdArticuloDescuento,
          Articulo: articulo,
          TipoDescuento: selected.TipoDescuento ?? 'P',
          ValorDescuento: this.toDecimal(selected.Descuento),
          Usuario: usuario,
          Activo: selected.Activo,
          TipoMtto: 'B'
        })
        .subscribe({
          next: () => this.showSuccess('Descuentos', 'Descuento eliminado correctamente.'),
          error: () => {
            this.descuentosDetalle.set(previousRows);
            this.errorMessage.set('No se pudo eliminar el descuento del artículo.');
            this.showError('Descuentos', 'No se pudo eliminar el descuento del artículo.');
          }
        });
    } else {
      this.showSuccess('Descuentos', 'Descuento removido de la captura actual.');
    }
  }

  saveArticulo() {
    if (this.articuloForm.invalid) {
      this.articuloForm.markAllAsTouched();
      return;
    }

    this.ensureDefaultBodega();

    this.saving.set(true);
    this.errorMessage.set('');

    const values = this.articuloForm.getRawValue();
    const currentUser = this.authService.currentUser()?.username ?? 'WEB';
    const modificar = Number(values.Modificar ?? (this.isEditMode() ? 1 : 0)) === 1 ? 1 : 0;

    if (this.isCompuesto()) {
      if (values.Activo && this.componentes().length < 2) {
        this.showError('Artículo Compuesto', 'No se puede activar un artículo compuesto que tenga menos de 2 productos componentes.');
        return;
      }
    }

    const isCm = String(values.TipoArticulo ?? '').trim().toUpperCase() === 'CM';
    const activoVal = isCm && this.componentes().length < 2 ? false : !!values.Activo;

    const articuloPayload: ArticuloUpdateDto = {
      Articulo: values.Articulo ?? '',
      Descripcion: values.Descripcion ?? '',
      Gpo1: values.GrupoInventario1 ?? '',
      Gpo2: values.GrupoInventario2 ?? '',
      Gpo3: values.GrupoInventario3 ?? '',
      Gpo4: values.GrupoInventario4 ?? '',
      Gpo5: values.GrupoInventario5 ?? '',
      TipoArticulo: values.TipoArticulo ?? '',
      ExistenciaMinima: Number(values.ExistenciaMinima ?? 0),
      ExistenciaMaxima: Number(values.ExistenciaMaxima ?? 0),
      Activo: activoVal,
      MetodoCosteoInterno: 'PR',
      ArticuloCuenta: String(values.ArticuloCuenta ?? '').trim() || 'NA',
      UnidadMedida: values.UnidadMedida ?? '',
      Peso: Number(values.Peso ?? 0),
      Ancho: Number(values.Ancho ?? 0),
      Rendimiento: Number(values.Rendimiento ?? 0),
      UltimoPrecio: Number(values.UltimoPrecio ?? 0),
      Usuario: currentUser,
      Gravado: '',
      Modificar: modificar,
      ArticuloCtaCrudo: values.ArticuloCtaCrudo ?? '',
      Acabado: values.Acabado ?? '0',
      Color: values.Color ?? '',
      MaterialId: 0
    };

    this.articulosService
      .updateArticulo(articuloPayload)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          const articuloResumen: ArticuloDto = {
            Articulo: articuloPayload.Articulo,
            Descripcion: articuloPayload.Descripcion,
            TipoArticulo: articuloPayload.TipoArticulo,
            GravadoComo: articuloPayload.Gravado,
            UltimoPrecio: articuloPayload.UltimoPrecio,
            MaterialId: articuloPayload.MaterialId,
            UsuarioCreacion: currentUser,
            Activo: articuloPayload.Activo
          };

          if (this.isCompuesto()) {
            this.articulosService
              .saveComponentes({
                ArticuloPadre: articuloResumen.Articulo,
                Componentes: this.componentes().map((c) => ({
                  ArticuloHijo: c.ArticuloHijo,
                  Cantidad: c.Cantidad
                }))
              })
              .subscribe({
                next: (res) => {
                  if (res.activo !== undefined) {
                    articuloResumen.Activo = res.activo;
                    this.articuloForm.patchValue({ Activo: res.activo }, { emitEvent: false });
                    this.syncActivoStateForCompuesto();
                  }
                },
                error: () => {
                  this.showError('Componentes', 'No se pudieron registrar los componentes del artículo compuesto.');
                }
              });
          }

          if (modificar === 1) {
            this.articulos.update((list) =>
              list.map((row) => (row.Articulo === articuloResumen.Articulo ? articuloResumen : row))
            );
            this.persistPendingDetailRows(articuloResumen.Articulo, currentUser);
            
            // Si editó y dejó una imagen pendiente, la subimos secuencialmente
            if (this.imagenPendiente()) {
              this.uploadImagen(); 
            } else {
              this.successMessage.set('Artículo actualizado correctamente.');
              this.showSuccess('Artículos', 'Artículo actualizado correctamente.');
            }
            return;
          }

          // ==========================================
          // LÓGICA DE CREACIÓN NUEVA (Modificar === 0)
          // ==========================================
          this.articulos.update((list) => [articuloResumen, ...list.filter((row) => row.Articulo !== articuloResumen.Articulo)]);
          this.isEditMode.set(true);
          this.articuloForm.patchValue({ Modificar: 1 }, { emitEvent: false });
          this.persistPendingDetailRows(articuloResumen.Articulo, currentUser);

          // VERIFICACIÓN SECUENCIAL DE IMAGEN
          if (this.imagenPendiente()) {
            this.uploadingImagen.set(true);
            const blob = this.imagenPendiente()!;
            
            this.articulosService.uploadArticuloImagen(articuloResumen.Articulo, blob, {
                NombreArchivo: this.imagenFileName(),
                ContentType: 'image/jpeg',
                Usuario: currentUser
              })
              .pipe(finalize(() => {
                this.uploadingImagen.set(false);
                // CRÍTICO: Emitimos al padre SIN IMPORTAR si la imagen falló o no.
                // El artículo SÍ se creó, y no queremos romper el flujo del ERP.
                this.articuloCreado.emit(articuloResumen.Articulo);
              }))
              .subscribe({
                next: () => {
                  this.imagenPendiente.set(null);
                  this.showSuccess('Artículos', 'Artículo y fotografía registrados correctamente.');
                },
                error: () => {
                  // Si falla la foto, avisamos, pero el modal se cerrará y el flujo continuará
                  this.showError('Imagen', 'El artículo se creó, pero la red falló al subir la fotografía.');
                }
              });
          } else {
            // Flujo normal sin fotografía
            this.showSuccess('Artículos', 'Artículo registrado correctamente.');
            this.articuloCreado.emit(articuloResumen.Articulo);
          }
        },
        error: () => {
          this.errorMessage.set('No se pudo guardar el artículo. Verifica los datos e intenta nuevamente.');
          this.showError('Artículos', 'No se pudo guardar el artículo.');
        }
      });
  }

  // ── Métodos de imagen del producto ─────────────────────────────────────────

  /** Abre el selector de galería del dispositivo */
  triggerGallery(): void {
    this.fileInputGallery()?.nativeElement.click();
  }

  /** Abre la cámara trasera del dispositivo (en desktop muestra selector de archivo como fallback) */
  triggerCamera(): void {
    this.fileInputCamera()?.nativeElement.click();
  }

  /** Limpia la imagen seleccionada/cargada de la vista previa */
  clearImagen(): void {
    this.revocarPreviewSiEsObjectUrl();
    this.imagenPreview.set(null);
    this.imagenPendiente.set(null);
    const g = this.fileInputGallery()?.nativeElement;
    const c = this.fileInputCamera()?.nativeElement;
    if (g) g.value = '';
    if (c) c.value = '';
  }

  /** Maneja el archivo seleccionado (galería o cámara), comprime y genera preview */
  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.showError('Imagen', 'Solo se permiten archivos de imagen (JPG, PNG, WEBP, etc).');
      return;
    }

    const MAX_INPUT_BYTES = 15 * 1024 * 1024; // 15 MB límite de entrada
    if (file.size > MAX_INPUT_BYTES) {
      this.showError('Imagen', 'El archivo supera el límite de 15 MB.');
      return;
    }

    try {
      const { blob, dataUrl } = await this.compressImagen(file);
      this.revocarPreviewSiEsObjectUrl();
      this.imagenPreview.set(dataUrl);
      this.imagenPendiente.set(blob);
      const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
      this.imagenFileName.set(`${baseName}.jpg`);
    } catch {
      this.showError('Imagen', 'No se pudo procesar la imagen seleccionada.');
    }
  }

  /** Sube el blob comprimido al endpoint del servidor */
  uploadImagen(): void {
    const blob = this.imagenPendiente();
    if (!blob) return;

    const articulo = this.currentArticuloCode();
    if (!articulo) {
      this.showError('Imagen', 'Guarde el artículo antes de subir la fotografía.');
      return;
    }

    const usuario = this.authService.currentUser()?.username ?? 'WEB';
    this.uploadingImagen.set(true);

    this.articulosService
      .uploadArticuloImagen(articulo, blob, {
        NombreArchivo: this.imagenFileName(),
        ContentType: 'image/jpeg',
        Usuario: usuario
      })
      .pipe(finalize(() => this.uploadingImagen.set(false)))
      .subscribe({
        next: () => {
          this.imagenPendiente.set(null);
          this.cargarImagenExistente(articulo, true);
          this.showSuccess('Imagen', 'Fotografía guardada correctamente.');
        },
        error: () => this.showError('Imagen', 'No se pudo guardar la fotografía.')
      });
  }

  /**
   * Carga la fotografía guardada del artículo desde el servidor al abrir en modo edición.
   * Usa Blob + createObjectURL para respetar las cabeceras JWT del interceptor.
   */
  private cargarImagenExistente(articulo: string, forceRefresh: boolean = false): void {
    this.revocarPreviewSiEsObjectUrl();
    this.imagenPreview.set(null);
    this.imagenPendiente.set(null);

    this.articulosService.getArticuloImagen(articulo, forceRefresh).subscribe({
      next: (blob) => {
        if (!blob || blob.size === 0) return;
        const url = URL.createObjectURL(blob);
        this.isObjectUrl = true;
        this.imagenPreview.set(url);
      },
      error: () => {
        // Sin imagen aún — no mostrar error al usuario
        this.imagenPreview.set(null);
      }
    });
  }

  /** Revoca el object URL si la vista previa actual fue generada con createObjectURL */
  private revocarPreviewSiEsObjectUrl(): void {
    if (this.isObjectUrl) {
      const url = this.imagenPreview();
      if (url) URL.revokeObjectURL(url);
      this.isObjectUrl = false;
    }
  }

  /**
   * Comprime una imagen en el navegador usando Canvas:
   * - Redimensiona a máx 800×800 px manteniendo proporción
   * - Exporta como JPEG con calidad 0.82 (∼100–250 KB en fotografías reales)
   */
  private compressImagen(file: File): Promise<{ blob: Blob; dataUrl: string }> {
    const MAX_PX = 800;
    const QUALITY = 0.82;
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('FileReader error'));
      reader.onload = (readerEvt) => {
        const img = new Image();
        img.onerror = () => reject(new Error('Image load error'));
        img.onload = () => {
          let { width, height } = img;
          if (width > MAX_PX || height > MAX_PX) {
            const ratio = Math.min(MAX_PX / width, MAX_PX / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('Canvas context unavailable')); return; }
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              if (!blob) { reject(new Error('Canvas toBlob failed')); return; }
              resolve({ blob, dataUrl: canvas.toDataURL('image/jpeg', QUALITY) });
            },
            'image/jpeg',
            QUALITY
          );
        };
        img.src = readerEvt.target!.result as string;
      };
      reader.readAsDataURL(file);
    });
  }
}
