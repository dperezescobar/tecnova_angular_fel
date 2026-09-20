import { Component, inject, signal, OnInit, computed, ChangeDetectionStrategy } from '@angular/core';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { firstValueFrom, forkJoin, Observable } from 'rxjs';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TagModule } from 'primeng/tag';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { TabsModule } from 'primeng/tabs';
import { DatePickerModule } from 'primeng/datepicker';
import { CheckboxModule } from 'primeng/checkbox';
import { SelectModule } from 'primeng/select';

import { GestionPreciosAdminService } from '../services/gestion-precios-admin';
import {
  ArticuloPrecioItem,
  CrossSellingItem,
  PromocionItem,
  TipoPrecioItem
} from '../../../core/models/gestion-precios-admin.models';
import { ArticuloPorBodegaDto } from '../../../core/models/facturacion.models';
import { FacturacionService } from '../../facturacion/services/facturacion';
import { ArticulosService } from '../../articulos/services/articulos';
import { AccesoRestringidoComponent } from '../../../shared/components/acceso-restringido/acceso-restringido';

@Component({
  selector: 'app-admin-gestion-precios',
  templateUrl: './admin-gestion-precios.html',
  styleUrl: './admin-gestion-precios.scss',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, ReactiveFormsModule, TableModule, ButtonModule,
    InputTextModule, InputNumberModule, DialogModule, ToastModule,
    TagModule, AutoCompleteModule, TabsModule, DatePickerModule,
    CheckboxModule, SelectModule, AccesoRestringidoComponent
  ],
  providers: [MessageService]
})
export class AdminGestionPreciosComponent implements OnInit {
  private fb = inject(FormBuilder);
  private service = inject(GestionPreciosAdminService);
  private facturacionService = inject(FacturacionService);
  private articulosService = inject(ArticulosService);
  private messageService = inject(MessageService);

  // Estados de datos
  tiposPrecio = signal<TipoPrecioItem[]>([]);
  precios = signal<ArticuloPrecioItem[]>([]);
  promociones = signal<PromocionItem[]>([]);
  crossSelling = signal<CrossSellingItem[]>([]);
  articulosOptions = signal<ArticuloPorBodegaDto[]>([]);
  articuloSuggestions = signal<string[]>([]);

  // Tab activa
  activeTab = signal('0');

  // Filtros
  filtroPrecio = signal('');
  filtroPromo = signal('');
  filtroCross = signal('');

  // Modales
  displayPrecioDialog = signal(false);
  displayPromoDialog = signal(false);
  displayCrossDialog = signal(false);
  loading = signal(false);
  isSaving = signal(false);
  sinPermiso = signal(false);

  // Exportar lista de precios vigentes (PDF/Excel, con/sin fotos)
  showPdfDialogPrecios = signal(false);
  exportandoPdfPrecios = signal(false);
  exportandoPreciosEnSegundoPlano = signal(false);
  exportProgresoTextoPrecios = signal('');
  private cancelExportPreciosRequested = false;

  // Formulario Precios (Pilares 1, 2, 3) — guarda Menudeo y Mayoreo en una sola accion
  precioForm = this.fb.group({
    articulo: ['', [Validators.required]],
    precioMenudeo: [0, [Validators.min(0)]],
    precioMayoreo: [0, [Validators.min(0)]],
    cantidadMinimaMayoreo: [1, [Validators.min(1)]]
  });

  tipoMenudeo = computed(() => this.tiposPrecio().find(t => !t.esMayoreo) ?? null);
  tipoMayoreo = computed(() => this.tiposPrecio().find(t => t.esMayoreo) ?? null);

  // Formulario Promociones (Pilar 4)
  promoForm = this.fb.group({
    idArticuloDescuento: [0],
    articulo: ['', [Validators.required]],
    tipoDescuento: ['P', [Validators.required]], // 'P' = %, 'M' = $
    valorDescuento: [0, [Validators.required, Validators.min(0.01)]],
    fdesde: [new Date(), [Validators.required]],
    fHasta: [new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), [Validators.required]],
    activo: [true]
  });

  // Formulario Cross-Selling (Pilar 5)
  crossForm = this.fb.group({
    crossSellingID: [0],
    articuloPrincipalID: ['', [Validators.required]],
    articuloSugeridoID: ['', [Validators.required]],
    descuentoSugerido: [0, [Validators.min(0)]],
    tipoDescuento: ['P'],
    mensajeSugerido: [''],
    activo: [true]
  });

  // Computados de Filtrado
  preciosFiltrados = computed(() => {
    const q = this.filtroPrecio().toLowerCase().trim();
    const items = this.precios();
    if (!q) return items;
    return items.filter(i => i.articulo.toLowerCase().includes(q) || i.articuloDescripcion.toLowerCase().includes(q));
  });

  promosFiltradas = computed(() => {
    const q = this.filtroPromo().toLowerCase().trim();
    const items = this.promociones();
    if (!q) return items;
    return items.filter(i => i.articulo.toLowerCase().includes(q) || i.articuloDescripcion.toLowerCase().includes(q));
  });

  crossFiltrados = computed(() => {
    const q = this.filtroCross().toLowerCase().trim();
    const items = this.crossSelling();
    if (!q) return items;
    return items.filter(i =>
      i.articuloPrincipalID.toLowerCase().includes(q) ||
      i.articuloPrincipalNombre.toLowerCase().includes(q) ||
      i.articuloSugeridoID.toLowerCase().includes(q) ||
      i.articuloSugeridoNombre.toLowerCase().includes(q)
    );
  });

  ngOnInit() {
    this.cargarCatalogos();
    this.cargarPrecios();
    this.cargarPromociones();
    this.cargarCrossSelling();
  }

  cargarCatalogos() {
    this.service.getTiposPrecio().subscribe({
      next: (t) => this.tiposPrecio.set(t),
      error: () => {}
    });

    this.facturacionService.getArticulosPorBodega('BOD01').subscribe({
      next: (rows) => {
        const items = rows ?? [];
        this.articulosOptions.set(items);
        this.articuloSuggestions.set(items.map(i => `${i.ARTICULO} - ${i.DESCRIPCION}`));
      }
    });
  }

  cargarPrecios() {
    this.loading.set(true);
    this.service.getPrecios().subscribe({
      next: (data) => this.precios.set(data),
      error: (err) => {
        if (err?.status === 403) this.sinPermiso.set(true);
        else this.showError('Error', err?.message || 'No se pudieron cargar precios');
      },
      complete: () => this.loading.set(false)
    });
  }

  cargarPromociones() {
    this.service.getPromociones().subscribe({
      next: (data) => this.promociones.set(data),
      error: (err) => { if (err?.status === 403) this.sinPermiso.set(true); }
    });
  }

  cargarCrossSelling() {
    this.service.getCrossSelling().subscribe({
      next: (data) => this.crossSelling.set(data),
      error: (err) => { if (err?.status === 403) this.sinPermiso.set(true); }
    });
  }

  // AutoComplete Helper
  onArticuloComplete(query: string) {
    const norm = String(query ?? '').toLowerCase().trim();
    const all = this.articulosOptions().map(i => `${i.ARTICULO} - ${i.DESCRIPCION}`);
    if (!norm) {
      this.articuloSuggestions.set(all);
      return;
    }
    this.articuloSuggestions.set(all.filter(x => x.toLowerCase().includes(norm)));
  }

  private extractCodigo(val: string): string {
    if (!val) return '';
    const parts = val.split(' - ');
    return parts[0].trim();
  }

  // Al seleccionar un articulo en el dialogo, precarga sus precios vigentes (Menudeo/Mayoreo)
  // en vez de dejar los campos en cero — evita sobrescribir por error un precio existente.
  onArticuloPrecioSeleccionado(valor: string) {
    const cod = this.extractCodigo(valor || '');
    if (!cod) return;

    const vigentes = this.precios().filter(p => p.articulo.toUpperCase() === cod.toUpperCase());
    const menudeo = vigentes.find(p => p.tipoPrecioID === this.tipoMenudeo()?.tipoPrecioID);
    const mayoreo = vigentes.find(p => p.tipoPrecioID === this.tipoMayoreo()?.tipoPrecioID);

    this.precioForm.patchValue({
      precioMenudeo: menudeo?.precio ?? 0,
      precioMayoreo: mayoreo?.precio ?? 0,
      cantidadMinimaMayoreo: mayoreo?.cantidadMinima ?? 1
    });
  }

  // CRUD PRECIOS
  abrirNuevoPrecio() {
    this.precioForm.reset({ precioMenudeo: 0, precioMayoreo: 0, cantidadMinimaMayoreo: 1 });
    this.displayPrecioDialog.set(true);
  }

  guardarPrecio() {
    if (this.precioForm.invalid) return;
    const val = this.precioForm.value;
    const cod = this.extractCodigo(val.articulo || '');
    if (!cod) {
      this.showError('Error', 'Seleccione un artículo válido');
      return;
    }

    const llamadas: Observable<{ message: string }>[] = [];
    const tipoMenudeo = this.tipoMenudeo();
    const tipoMayoreo = this.tipoMayoreo();

    if ((val.precioMenudeo ?? 0) > 0 && tipoMenudeo) {
      llamadas.push(this.service.guardarPrecio({
        articulo: cod,
        tipoPrecioID: tipoMenudeo.tipoPrecioID,
        precio: val.precioMenudeo!,
        cantidadMinima: 1
      }));
    }
    if ((val.precioMayoreo ?? 0) > 0 && tipoMayoreo) {
      llamadas.push(this.service.guardarPrecio({
        articulo: cod,
        tipoPrecioID: tipoMayoreo.tipoPrecioID,
        precio: val.precioMayoreo!,
        cantidadMinima: val.cantidadMinimaMayoreo || 1
      }));
    }

    if (llamadas.length === 0) {
      this.showError('Error', 'Ingrese al menos un precio (Menudeo o Mayoreo).');
      return;
    }

    this.isSaving.set(true);
    forkJoin(llamadas).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Éxito', detail: 'Precio(s) actualizado(s) correctamente.' });
        this.displayPrecioDialog.set(false);
        this.cargarPrecios();
      },
      error: (err) => this.showError('Error', err?.error?.message || 'No se guardó el precio'),
      complete: () => this.isSaving.set(false)
    });
  }

  // CRUD PROMOCIONES
  abrirNuevaPromo() {
    this.promoForm.reset({
      idArticuloDescuento: 0,
      articulo: '',
      tipoDescuento: 'P',
      valorDescuento: 0,
      fdesde: new Date(),
      fHasta: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      activo: true
    });
    this.displayPromoDialog.set(true);
  }

  guardarPromo() {
    if (this.promoForm.invalid) return;
    const val = this.promoForm.value;
    const cod = this.extractCodigo(val.articulo || '');
    if (!cod) {
      this.showError('Error', 'Seleccione un artículo válido');
      return;
    }

    this.isSaving.set(true);
    const fdesdeStr = this.toLocalIsoString(val.fdesde);
    const fhastaStr = this.toLocalIsoString(val.fHasta);

    this.service.guardarPromocion({
      idArticuloDescuento: val.idArticuloDescuento || 0,
      articulo: cod,
      tipoDescuento: val.tipoDescuento || 'P',
      valorDescuento: val.valorDescuento || 0,
      fdesde: fdesdeStr,
      fHasta: fhastaStr,
      activo: val.activo ?? true
    }).subscribe({
      next: (res) => {
        this.messageService.add({ severity: 'success', summary: 'Éxito', detail: res.message });
        this.displayPromoDialog.set(false);
        this.cargarPromociones();
      },
      error: (err) => this.showError('Error', err?.error?.message || 'No se guardó la promoción'),
      complete: () => this.isSaving.set(false)
    });
  }

  private toLocalIsoString(d: Date | string | null | undefined): string {
    if (!d) return new Date().toISOString().substring(0, 19);
    const date = new Date(d);
    if (isNaN(date.getTime())) return new Date().toISOString().substring(0, 19);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  desactivarPromo(p: PromocionItem) {
    this.service.eliminarPromocion(p.idArticuloDescuento).subscribe({
      next: (res) => {
        this.messageService.add({ severity: 'warn', summary: 'Promoción Desactivada', detail: res.message });
        this.cargarPromociones();
      }
    });
  }

  // CRUD CROSS-SELLING
  abrirNuevoCross() {
    this.crossForm.reset({
      crossSellingID: 0,
      articuloPrincipalID: '',
      articuloSugeridoID: '',
      descuentoSugerido: 0,
      tipoDescuento: 'P',
      mensajeSugerido: '',
      activo: true
    });
    this.displayCrossDialog.set(true);
  }

  guardarCross() {
    if (this.crossForm.invalid) return;
    const val = this.crossForm.value;
    const principal = this.extractCodigo(val.articuloPrincipalID || '');
    const sugerido = this.extractCodigo(val.articuloSugeridoID || '');

    if (!principal || !sugerido) {
      this.showError('Error', 'Seleccione artículos válidos');
      return;
    }

    this.isSaving.set(true);
    this.service.guardarCrossSelling({
      crossSellingID: val.crossSellingID || 0,
      articuloPrincipalID: principal,
      articuloSugeridoID: sugerido,
      descuentoSugerido: val.descuentoSugerido || 0,
      tipoDescuento: val.tipoDescuento || 'P',
      mensajeSugerido: val.mensajeSugerido || '',
      activo: val.activo ?? true
    }).subscribe({
      next: (res) => {
        this.messageService.add({ severity: 'success', summary: 'Éxito', detail: res.message });
        this.displayCrossDialog.set(false);
        this.cargarCrossSelling();
      },
      error: (err) => this.showError('Error', err?.error?.message || 'No se guardó el cross-selling'),
      complete: () => this.isSaving.set(false)
    });
  }

  desactivarCross(c: CrossSellingItem) {
    this.service.eliminarCrossSelling(c.crossSellingID).subscribe({
      next: (res) => {
        this.messageService.add({ severity: 'warn', summary: 'Regla Desactivada', detail: res.message });
        this.cargarCrossSelling();
      }
    });
  }

  private showError(summary: string, detail: string) {
    this.messageService.add({ severity: 'error', summary, detail });
  }

  // ── Exportar lista de precios vigentes (mismo patron que ArticuloPrecioComponent /
  // catalogo de articulos: xlsx/jspdf en carga diferida, PDF con fotos en segundo plano) ──

  cancelarExportacionPrecios(): void {
    this.cancelExportPreciosRequested = true;
    this.exportProgresoTextoPrecios.set('Cancelando exportación...');
  }

  async exportarPreciosExcel() {
    const list = this.preciosFiltrados();
    if (!list || list.length === 0) {
      this.messageService.add({ severity: 'info', summary: 'Sin datos', detail: 'No hay precios para exportar.' });
      return;
    }

    try {
      const XLSX = await import('xlsx');
      const rows = list.map(p => ({
        'Artículo': p.articulo,
        'Descripción': p.articuloDescripcion,
        'Tipo Tarifa': p.tipoPrecioNombre,
        'Cant. Mínima': Number(p.cantidadMinima || 1),
        'Precio': Number(p.precio || 0)
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Precios');
      XLSX.writeFile(workbook, `Lista_Precios_${new Date().toISOString().slice(0, 10)}.xlsx`);
      this.messageService.add({ severity: 'success', summary: 'Éxito', detail: 'Lista de precios exportada a Excel.' });
      this.showPdfDialogPrecios.set(false);
    } catch {
      this.showError('Error', 'No se pudo generar el archivo Excel.');
    }
  }

  async ejecutarExportarPdfPrecios(conImagenes: boolean) {
    const list = this.preciosFiltrados();
    if (!list || list.length === 0) {
      this.messageService.add({ severity: 'info', summary: 'Sin datos', detail: 'No hay precios para exportar.' });
      this.showPdfDialogPrecios.set(false);
      return;
    }

    if (conImagenes) {
      this.showPdfDialogPrecios.set(false);
      this.exportandoPreciosEnSegundoPlano.set(true);
      this.cancelExportPreciosRequested = false;
      this.exportProgresoTextoPrecios.set('Iniciando exportación con imágenes...');
    } else {
      this.exportandoPdfPrecios.set(true);
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
      doc.text(`Fecha de emisión: ${new Date().toLocaleDateString('es-SV')}   |   Registros: ${list.length}`, 40, 56);

      const imageMap: Record<string, string> = {};

      if (conImagenes) {
        // El DTO de precios no trae bandera TieneImagen: se intenta descargar la foto de
        // cada articulo unico y se omite en silencio si no existe (404).
        const codigosUnicos = Array.from(new Set(list.map(p => p.articulo)));
        const batchSize = 5;

        for (let i = 0; i < codigosUnicos.length; i += batchSize) {
          if (this.cancelExportPreciosRequested) {
            this.messageService.add({ severity: 'info', summary: 'Cancelado', detail: 'La exportación fue cancelada.' });
            this.exportandoPreciosEnSegundoPlano.set(false);
            return;
          }

          const batch = codigosUnicos.slice(i, i + batchSize);
          this.exportProgresoTextoPrecios.set(`Descargando fotos: ${Math.min(i + batchSize, codigosUnicos.length)} de ${codigosUnicos.length}...`);

          await Promise.all(batch.map(async (codigo) => {
            try {
              const blob = await firstValueFrom(this.articulosService.getArticuloImagen(codigo));
              imageMap[codigo] = await this.blobToDataUrlPrecios(blob);
            } catch {}
          }));

          await new Promise(resolve => setTimeout(resolve, 15));
        }

        this.exportProgresoTextoPrecios.set('Generando documento PDF...');
      }

      const headers = conImagenes
        ? [['Img', 'Artículo', 'Descripción', 'Tipo Tarifa', 'Cant. Mín.', 'Precio']]
        : [['Artículo', 'Descripción', 'Tipo Tarifa', 'Cant. Mín.', 'Precio']];

      const body = list.map(p => {
        const row = [
          p.articulo,
          p.articuloDescripcion,
          p.tipoPrecioNombre,
          `${p.cantidadMinima}`,
          `$${Number(p.precio || 0).toFixed(2)}`
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
          4: { halign: 'right' },
          5: { halign: 'right' }
        } : {
          3: { halign: 'right' },
          4: { halign: 'right' }
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
      this.messageService.add({ severity: 'success', summary: 'Éxito', detail: 'Lista de precios descargada en PDF.' });
      this.showPdfDialogPrecios.set(false);
    } catch {
      this.showError('Error', 'No se pudo generar el PDF de la lista de precios.');
    } finally {
      this.exportandoPdfPrecios.set(false);
      this.exportandoPreciosEnSegundoPlano.set(false);
    }
  }

  private blobToDataUrlPrecios(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}
