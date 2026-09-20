import { Component, inject, signal, OnInit, computed, ChangeDetectionStrategy } from '@angular/core';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { catchError, finalize, firstValueFrom, map, of } from 'rxjs';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TagModule } from 'primeng/tag';
import { AutoCompleteModule } from 'primeng/autocomplete';

import { ArticuloPrecioService } from '../precios';
import { ArticuloDoblePrecioGuardarRequest, ArticuloPrecioVigenteResponse } from '../../../core/models/articulo-precio.models';
import { ArticuloPorBodegaDto } from '../../../core/models/facturacion.models';
import { AuthService } from '../../../core/services/auth';
import { ArticulosService } from '../../articulos/services/articulos';
import { FacturacionService } from '../../facturacion/services/facturacion';

@Component({
  selector: 'app-gestion-precios',
  templateUrl: './articulo-precio.html',
  styleUrl: './articulo-precio.scss',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, ReactiveFormsModule, TableModule, ButtonModule,
    InputTextModule, InputNumberModule, DialogModule, ToastModule,
    TagModule, AutoCompleteModule
  ],
  providers: [MessageService]
})
export class ArticuloPrecioComponent implements OnInit {
  private fb = inject(FormBuilder);
  private preciosService = inject(ArticuloPrecioService);
  private messageService = inject(MessageService);
  private authService = inject(AuthService);
  private articulosService = inject(ArticulosService);
  private facturacionService = inject(FacturacionService);

  private readonly articuloChunkSize = 80;

  precios = signal<ArticuloPrecioVigenteResponse[]>([]);
  loading = signal(false);
  displayDialog = signal(false);
  isSaving = signal(false);
  filtroArticulo = signal('');
  verImagenes = signal(false);
  showPdfDialog = signal(false);
  exportandoPdf = signal(false);
  exportandoEnSegundoPlano = signal(false);
  exportProgresoTexto = signal('');
  exportGrupoFiltro = signal('');
  precioImagenUrls = signal<Record<string, string>>({});
  private loadingPrecioImageCodes = new Set<string>();
  private cancelExportRequested = false;

  gruposDisponibles = computed(() => {
    const list = this.precios();
    const set = new Set<string>();
    for (const item of list) {
      const g = (item.grupoInventario ?? '').trim();
      if (g) set.add(g);
    }
    return Array.from(set).sort();
  });

  itemsParaExportar = computed(() => {
    let list = this.precios();
    const grupo = this.exportGrupoFiltro().trim();
    if (grupo) {
      list = list.filter(p => (p.grupoInventario ?? '').trim().toUpperCase() === grupo.toUpperCase());
    }
    const query = this.filtroArticulo().toLowerCase().trim();
    if (query) {
      list = list.filter(p => {
        const codigo = String(p.articulo ?? '').toLowerCase();
        const desc = String(p.articulodescripcion ?? '').toLowerCase();
        return codigo.includes(query) || desc.includes(query);
      });
    }
    return list;
  });

  articulosOptions = signal<ArticuloPorBodegaDto[]>([]);
  articuloSuggestions = signal<string[]>([]);
  articuloCardSearch = signal('');
  articleViewMode = signal<'listado' | 'imagenes'>('listado');
  articuloVisibleLimit = signal(this.articuloChunkSize);
  articuloImagenUrls = signal<Record<string, string>>({});
  articuloSeleccionadoCodigo = signal<string | null>(null);

  private articuloImagenLoading = new Set<string>();

  preciosFiltrados = computed(() => {
    const query = this.filtroArticulo().toLowerCase();
    const all = this.precios();
    if (!query) return all;
    return all.filter(p => {
      const codigo = String(p.articulo ?? '').toLowerCase();
      const desc = String(p.articulodescripcion ?? '').toLowerCase();
      return codigo.includes(query) || desc.includes(query);
    });
  });

  filteredArticuloCards = computed(() => {
    const query = this.articuloCardSearch().trim().toLowerCase();
    const options = this.articulosOptions();
    if (!query) return options;
    return options.filter(item => {
      const codigo = String(item.ARTICULO ?? '').toLowerCase();
      const descripcion = String(item.DESCRIPCION ?? '').toLowerCase();
      return codigo.includes(query) || descripcion.includes(query);
    });
  });

  articuloCardsRemaining = computed(() => {
    const remaining = this.filteredArticuloCards().length - this.articuloVisibleLimit();
    return remaining > 0 ? remaining : 0;
  });

  visibleArticuloCards = computed(() =>
    this.filteredArticuloCards().slice(0, this.articuloVisibleLimit())
  );

  precioForm = this.fb.group({
    articulo: ['', [Validators.required, Validators.maxLength(40)]],
    tipoPrecioID: [1, [Validators.required]],
    precio: [0, [Validators.required, Validators.min(0)]],
    cantidadMinima: [1, [Validators.required, Validators.min(1)]],
    usuario: [this.authService.currentUser()?.username ?? '', Validators.required],
    precioUnidad: [0, [Validators.required, Validators.min(0)]],
    precioMayoreo: [0, [Validators.min(0)]],
    cantidadMinimaMayoreo: [1, [Validators.min(1)]],
    descripcionarticulo: ['']
  });

  ngOnInit() {
    this.cargarPrecios();
    this.cargarArticulos();
  }

  cargarPrecios() {
    this.loading.set(true);
    this.preciosService.obtenerPreciosVigentes().subscribe({
      next: (data) => this.precios.set(data),
      error: (err) => this.showError('Error al cargar precios', err?.message ?? 'Ocurrió un error.'),
      complete: () => this.loading.set(false)
    });
  }

  private cargarArticulos() {
    this.facturacionService.getArticulosPorBodega('BOD01').subscribe({
      next: (rows) => {
        const items = rows ?? [];
        this.articulosOptions.set(items);
        this.articuloSuggestions.set(items.map(item => this.toArticuloDisplay(item)));
      },
      error: () => {
        this.articulosOptions.set([]);
        this.articuloSuggestions.set([]);
      }
    });
  }

  onFiltroInput(value: string) {
    this.filtroArticulo.set(String(value ?? '').toLowerCase().trim());
  }

  abrirNuevo() {
    this.precioForm.reset({
      tipoPrecioID: 1, precio: 0, cantidadMinima: 1,
      usuario: this.authService.currentUser()?.username ?? ''
    });
    this.articuloSeleccionadoCodigo.set(null);
    this.articleViewMode.set('listado');
    this.displayDialog.set(true);
  }

  editarPrecio(p: ArticuloPrecioVigenteResponse) {
    this.precioForm.reset({
      tipoPrecioID: 1, precio: 0, cantidadMinima: 1,
      usuario: this.authService.currentUser()?.username ?? ''
    });
    this.articuloSeleccionadoCodigo.set(p.articulo);
    this.precioForm.patchValue({
      articulo: `${p.articulo} - ${p.articulodescripcion}`,
      descripcionarticulo: p.articulodescripcion
    });
    if (p.tipoPrecio === 'NORMAL') {
      this.precioForm.patchValue({ precioUnidad: p.precio });
    } else {
      this.precioForm.patchValue({ precioMayoreo: p.precio, cantidadMinimaMayoreo: p.cantidadMinima });
    }
    this.articleViewMode.set('listado');
    this.displayDialog.set(true);
  }

  setArticleViewMode(mode: 'listado' | 'imagenes') {
    this.articleViewMode.set(mode);
    if (mode === 'imagenes') {
      this.articuloVisibleLimit.set(this.articuloChunkSize);
      this.ensureVisibleArticuloImages();
    }
  }

  onArticuloCardSearch(value: string) {
    this.articuloCardSearch.set(String(value ?? '').trim());
    this.articuloVisibleLimit.set(this.articuloChunkSize);
    if (this.articleViewMode() === 'imagenes') {
      this.ensureVisibleArticuloImages();
    }
  }

  loadMoreArticuloCards() {
    this.articuloVisibleLimit.update(current => current + this.articuloChunkSize);
    this.ensureVisibleArticuloImages();
  }

  selectArticuloCard(art: ArticuloPorBodegaDto) {
    const codigo = String(art.ARTICULO ?? '').trim();
    this.articuloSeleccionadoCodigo.set(codigo);
    this.precioForm.patchValue({
      articulo: codigo,
      descripcionarticulo: String(art.DESCRIPCION ?? '').trim()
    });
    this.showInfo('Selección', `Artículo ${codigo} seleccionado.`);
  }

  onArticuloComplete(query: string) {
    const normalized = String(query ?? '').trim().toLowerCase();
    const options = this.articulosOptions().map(item => this.toArticuloDisplay(item));
    if (!normalized) {
      this.articuloSuggestions.set(options);
      return;
    }
    this.articuloSuggestions.set(options.filter(item => item.toLowerCase().includes(normalized)));
  }

  onArticuloSelect(displayValue: string) {
    const articulo = this.findArticuloByDisplay(String(displayValue ?? '').trim());
    if (!articulo) {
      this.precioForm.patchValue({ articulo: '', descripcionarticulo: '' });
      return;
    }
    this.precioForm.patchValue({
      articulo: articulo.ARTICULO,
      descripcionarticulo: articulo.DESCRIPCION
    });
    this.articuloSeleccionadoCodigo.set(articulo.ARTICULO);
  }

  articuloImagenUrl(codigo: string): string | null {
    return this.articuloImagenUrls()[codigo] ?? null;
  }

  toggleVerImagenes(checked: boolean): void {
    this.verImagenes.set(checked);
  }

  getPrecioImagenUrl(codigo: string): string | null {
    if (!this.verImagenes()) return null;
    const url = this.precioImagenUrls()[codigo];
    if (url) return url;
    if (!this.loadingPrecioImageCodes.has(codigo)) {
      this.cargarImagenPrecio(codigo);
    }
    return null;
  }

  private cargarImagenPrecio(codigo: string): void {
    this.loadingPrecioImageCodes.add(codigo);
    this.articulosService.getArticuloImagen(codigo).pipe(
      map(blob => URL.createObjectURL(blob)),
      catchError(() => of(null)),
      finalize(() => this.loadingPrecioImageCodes.delete(codigo))
    ).subscribe(url => {
      if (url) {
        this.precioImagenUrls.update(prev => ({ ...prev, [codigo]: url }));
      }
    });
  }

  guardarDoblePrecio() {
    if (this.precioForm.invalid) return;
    const formValue = this.precioForm.value;
    const articulosel = this.articuloSeleccionadoCodigo();
    const preciosel = formValue.precioUnidad ?? 0;
    if (!articulosel || preciosel === 0) {
      this.showError('Error de validación', 'Debe seleccionar un artículo válido y un precio válido.');
      return;
    }
    this.isSaving.set(true);

    const req: ArticuloDoblePrecioGuardarRequest = {
      articulo: articulosel,
      precioUnidad: preciosel,
      precioMayoreo: (formValue.precioMayoreo && formValue.precioMayoreo > 0) ? formValue.precioMayoreo : null,
      cantidadMinimaMayoreo: (formValue.cantidadMinimaMayoreo && formValue.cantidadMinimaMayoreo > 0) ? formValue.cantidadMinimaMayoreo : null,
      usuario: this.authService.currentUser()?.username ?? ''
    };

    this.preciosService.guardarDoblePrecio(req).subscribe({
      next: () => this.finalizarGuardado('Precios actualizados correctamente'),
      error: (err) => {
        this.isSaving.set(false);
        this.showError('Error al guardar precios', err?.error?.message || err?.message || 'No se pudieron actualizar los precios.');
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
      this.showInfo('Sin datos', 'No hay registros para exportar.');
      return;
    }

    try {
      const XLSX = await import('xlsx');
      const rows = list.map(p => ({
        'Artículo': p.articulo,
        'Descripción': p.articulodescripcion,
        'Grupo': p.grupoInventario || 'Sin Grupo',
        'Tipo Precio': p.tipoPrecio,
        'Precio': Number(p.precio || 0),
        'Cant. Mínima': Number(p.cantidadMinima || 1),
        'Fecha Inicio': p.fechaInicio ? new Date(p.fechaInicio).toLocaleDateString('es-SV') : ''
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Precios');
      XLSX.writeFile(workbook, `Lista_Precios_${new Date().toISOString().slice(0, 10)}.xlsx`);
      this.showInfo('Éxito', 'Lista de precios exportada a Excel.');
      this.showPdfDialog.set(false);
    } catch {
      this.showError('Error', 'No se pudo generar el archivo Excel.');
    }
  }

  async ejecutarExportarPdf(conImagenes: boolean) {
    const list = this.itemsParaExportar();
    if (!list || list.length === 0) {
      this.showInfo('Sin datos', 'No hay precios para exportar.');
      this.showPdfDialog.set(false);
      return;
    }

    // Si es con imágenes, cerramos el diálogo y procesamos en segundo plano
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
      doc.text('Lista de Precios Vigentes', 40, 40);
      doc.setFontSize(9);
      const grupoText = this.exportGrupoFiltro() ? `Grupo: ${this.exportGrupoFiltro()}   |   ` : '';
      doc.text(`${grupoText}Fecha de emisión: ${new Date().toLocaleDateString('es-SV')}   |   Registros: ${list.length}`, 40, 56);

      const imageMap: Record<string, string> = {};

      if (conImagenes) {
        const articulosConImg = Array.from(new Set(list.filter(p => p.tieneImagen).map(p => p.articulo)));
        const totalConImg = articulosConImg.length;
        const batchSize = 5;

        for (let i = 0; i < totalConImg; i += batchSize) {
          if (this.cancelExportRequested) {
            this.showInfo('Cancelado', 'La exportación fue cancelada.');
            this.exportandoEnSegundoPlano.set(false);
            return;
          }

          const batch = articulosConImg.slice(i, i + batchSize);
          this.exportProgresoTexto.set(`Descargando fotos: ${Math.min(i + batchSize, totalConImg)} de ${totalConImg}...`);

          await Promise.all(batch.map(async (codigo) => {
            try {
              const blob = await firstValueFrom(this.articulosService.getArticuloImagen(codigo));
              const dataUrl = await this.blobToDataUrl(blob);
              imageMap[codigo] = dataUrl;
            } catch {}
          }));

          // Yield de 15ms al event loop para que el usuario pueda seguir trabajando libremente
          await new Promise(resolve => setTimeout(resolve, 15));
        }

        this.exportProgresoTexto.set('Generando documento PDF...');
      }

      const headers = conImagenes
        ? [['Img', 'Artículo', 'Descripción', 'Grupo', 'Tipo', 'Precio', 'Cant. Mín.']]
        : [['Artículo', 'Descripción', 'Grupo', 'Tipo', 'Precio', 'Cant. Mín.']];

      const body = list.map(p => {
        const row = [
          p.articulo,
          p.articulodescripcion,
          p.grupoInventario || '-',
          p.tipoPrecio,
          `$${Number(p.precio || 0).toFixed(2)}`,
          `${p.cantidadMinima}`
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
          6: { halign: 'right' }
        } : {
          4: { halign: 'right' },
          5: { halign: 'right' }
        },
        margin: { left: 40, right: 40 },
        didDrawCell: (data) => {
          if (conImagenes && data.section === 'body' && data.column.index === 0) {
            const item = list[data.row.index];
            const base64 = imageMap[item.articulo];
            if (base64) {
              try {
                doc.addImage(base64, 'JPEG', data.cell.x + 3, data.cell.y + 3, 24, 24);
              } catch {}
            }
          }
        }
      });

      doc.save(`lista_precios_${new Date().toISOString().slice(0, 10)}.pdf`);
      this.showInfo('Éxito', 'Lista de precios descargada en PDF.');
      this.showPdfDialog.set(false);
    } catch {
      this.showError('Error', 'No se pudo generar el PDF de la lista de precios.');
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

  private finalizarGuardado(msj: string) {
    this.isSaving.set(false);
    this.messageService.add({ severity: 'success', summary: 'Éxito', detail: msj });
    this.displayDialog.set(false);
    this.cargarPrecios();
  }

  private ensureVisibleArticuloImages(): void {
    if (this.articleViewMode() !== 'imagenes') return;
    for (const item of this.visibleArticuloCards()) {
      this.ensureArticuloImageLoaded(item.ARTICULO);
    }
  }

  private ensureArticuloImageLoaded(codigo: string): void {
    const key = String(codigo ?? '').trim();
    if (!key) return;
    const urls = this.articuloImagenUrls();
    if (urls[key] || this.articuloImagenLoading.has(key)) return;
    const articulo = this.articulosOptions().find(item => String(item.ARTICULO ?? '').trim() === key);
    if (!articulo?.TIENE_IMAGEN) return;
    this.articuloImagenLoading.add(key);
    this.articulosService.getArticuloImagen(key).pipe(
      map(blob => ({ codigo: key, url: URL.createObjectURL(blob) })),
      catchError(() => of(null)),
      finalize(() => this.articuloImagenLoading.delete(key))
    ).subscribe(result => {
      if (!result) return;
      this.articuloImagenUrls.update(current => ({ ...current, [result.codigo]: result.url }));
    });
  }

  private toArticuloDisplay(item: ArticuloPorBodegaDto): string {
    return `${String(item.ARTICULO ?? '').trim()} - ${String(item.DESCRIPCION ?? '').trim()}`;
  }

  private findArticuloByDisplay(displayValue: string): ArticuloPorBodegaDto | undefined {
    const normalized = displayValue.toLowerCase();
    if (!normalized) return undefined;
    return this.articulosOptions().find(item =>
      this.toArticuloDisplay(item).toLowerCase() === normalized ||
      String(item.ARTICULO ?? '').trim().toLowerCase() === normalized
    );
  }

  private showInfo(summary: string, detail: string) {
    this.messageService.add({ severity: 'info', summary, detail });
  }

  private showError(summary: string, detail: string) {
    this.messageService.add({ severity: 'error', summary, detail });
  }
}
