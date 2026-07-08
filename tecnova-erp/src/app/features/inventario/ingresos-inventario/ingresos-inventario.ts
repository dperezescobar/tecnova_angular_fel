import { Component, signal, computed, inject, viewChild, effect } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { IngresosInventarioService, MovimientoInventarioGuardarDto, MovimientoInventarioDetalleGuardarDto, DetalleMovimientoUpdateDto } from './ingresos-inventario.service';
import { ArticuloPorBodegaDto } from '../../../core/models/facturacion.models';
import { ArticulosLazyService } from '../../facturacion/services/articulos-lazy.service';
import { AutoCompleteModule, AutoCompleteCompleteEvent, AutoCompleteLazyLoadEvent, AutoCompleteSelectEvent } from 'primeng/autocomplete';
import { InputNumberModule } from 'primeng/inputnumber';
import { TagModule } from 'primeng/tag';
import {  ProgressSpinnerModule } from 'primeng/progressspinner';
import { AuthService } from '../../../core/services/auth';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { ArticulosService } from '../../articulos/services/articulos';
import { ArticuloPrecioService } from '../../precios/precios';
import { DialogModule } from 'primeng/dialog';
import { ArticulosComponent } from '../../articulos/articulos';
import { catchError, finalize, map, of } from 'rxjs';
import { EliminarConfirmDialogComponent } from '../../../shared/components/eliminar-confirm-dialog/eliminar-confirm-dialog';

interface MaestroForm {
  fecha: Date;
  observacion: string;
  bodega: string;
  bodegaDestino: string;
  tipoTransInv: string;
  tipoMov: string;
  contabilizar: number;
  tipoMtto: string;
  sucursal: string;
  documentoSujetoDevolucion: boolean;
  existenciaFecDoc: number;
}

interface DetalleForm {
  articulo: string;
  cantidad: number;
  precioUnitario: number;
  calidad: number;
  tipoColor: string;
  cuentaContable: string;
  centroCosto: string;
  costoUnitario: number;
  usuario: string;
  idColor: number;
  idAcabado: string;
}

@Component({
  selector: 'app-ingresos-inventario',
  templateUrl: './ingresos-inventario.html',
  styleUrl: './ingresos-inventario.scss',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ButtonModule, AutoCompleteModule, ToastModule, ProgressSpinnerModule, TagModule, InputNumberModule, DialogModule, ArticulosComponent, EliminarConfirmDialogComponent],
   providers: [MessageService]
})
export class IngresosInventarioComponent {
  // Filtros de fecha para el listado
  fechaDesde = signal< string >(this.getPrimerDiaMesAnterior());
  fechaHasta = signal< string >(this.getFechaActual());

      private authService = inject(AuthService);
        private messageService = inject(MessageService);
          private articulosService = inject(ArticulosService);
            private preciosService = inject(ArticuloPrecioService);
            private articulosLazyService = inject(ArticulosLazyService);
          private readonly articuloPageSize = 20;
          showArticuloDialog = signal(false);
  articuloChild = viewChild(ArticulosComponent);
  eliminarConfirmDialog = viewChild(EliminarConfirmDialogComponent);
  modo = signal<'listado' | 'nuevo' | 'edicion'>('listado');
  maestroForm: FormGroup;
  detalleForm: FormGroup;
  detalles = signal<DetalleForm[]>([]);
  documentoInv = signal<number>(0);
  estadoDocumento = signal<'ELABORACION' | 'APLICADO' | 'ANULADO' | 'OTRO' >('ELABORACION');
  puedoEditar = computed(() => this.estadoDocumento() === 'ELABORACION');
puedoDesaplicar = computed(() => this.estadoDocumento() === 'APLICADO' && this.documentoInv() > 0);
  movimientos = signal<any[]>([]);
  detallesApi = signal<any[]>([]);
  loading = signal(false);
  loadingDetail = signal(false);
  articleViewMode = signal<'listado' | 'imagenes'>('listado');
  articuloImagenUrls = signal<Record<string, string>>({});
  articuloImagenDialogVisible = signal(false);
  articuloSeleccionadoCodigo = signal<string | null>(null);
  private api = inject(IngresosInventarioService);
    selectedArticuloImagen = signal<ArticuloPorBodegaDto | null>(null);
  private articuloImagenLoading = new Set<string>();
  lightboxVisible = signal(false);
  lightboxCodigoActual = signal<string | null>(null);
  lightboxUrl = computed(() => {
    const codigo = this.lightboxCodigoActual();
    return codigo ? this.articuloImagenUrl(codigo) : null;
  });
  lightboxArticuloLabel = computed(() => {
    const codigo = this.lightboxCodigoActual();
    if (!codigo) return '';
    const art = this.articuloImgResults().find(a => a.ARTICULO === codigo);
    return art ? `${codigo} — ${art.DESCRIPCION}` : codigo;
  });

  // ===== Listado: autocomplete nativo con virtual scroll + lazy load =====
  // Recupera la sensación de "dropdown compacto" del autocomplete original, pero ya no trae
  // el catálogo completo: cada tecleo pide 20 resultados, y el scroll dentro del propio
  // dropdown pide los siguientes 20 (misma API paginada que Imágenes, GetArticulosPorBodegaLazy).
  readonly articuloListItemSize = 40;
  articuloListSuggestions = signal<string[]>([]);
  articuloListLoading = signal(false);
  private articuloListQuery = '';
  private articuloListSkip = 0;
  private articuloListHasMore = true;
  private articuloListLoadingFlag = false;
  private articuloListItemsByDisplay = new Map<string, ArticuloPorBodegaDto>();

  // ===== Imágenes: grid con búsqueda y scroll infinito propios =====
  articuloImgQuery = signal('');
  articuloImgResults = signal<ArticuloPorBodegaDto[]>([]);
  private articuloImgSkip = 0;
  articuloImgHasMore = signal(true);
  articuloImgLoading = signal(false);
  private articuloImgSearchTimer: ReturnType<typeof setTimeout> | undefined;

  // ===== Carrito del documento: paginado + búsqueda en memoria =====
  // Un documento puede tener cientos de líneas ya guardadas; pintarlas todas de golpe y pedir
  // la imagen de cada una satura la pantalla. Se pagina y solo se piden imágenes de la página visible.
  private readonly detallePageSize = 20;
  detalleFiltro = signal('');
  detallePagina = signal(1);

  detallesFiltrados = computed(() => {
    const term = this.detalleFiltro().trim().toLowerCase();
    const items = this.detallesApi();
    if (!term) return items;
    return items.filter((d) =>
      String(d.articulo ?? '').toLowerCase().includes(term) ||
      String(d.descripcion ?? '').toLowerCase().includes(term)
    );
  });

  detalleTotalPaginas = computed(() => Math.max(1, Math.ceil(this.detallesFiltrados().length / this.detallePageSize)));

  detallesPagina = computed(() => {
    const pagina = this.detallePagina();
    const inicio = (pagina - 1) * this.detallePageSize;
    return this.detallesFiltrados().slice(inicio, inicio + this.detallePageSize);
  });

  onDetalleFiltroChange(value: string) {
    this.detalleFiltro.set(String(value ?? ''));
    this.detallePagina.set(1);
  }

  irPaginaDetalleAnterior() {
    this.detallePagina.update((p) => Math.max(1, p - 1));
  }

  irPaginaDetalleSiguiente() {
    this.detallePagina.update((p) => Math.min(this.detalleTotalPaginas(), p + 1));
  }

  abrirLightbox(codigo: string, event: Event): void {
    event.stopPropagation();
    if (!this.articuloImagenUrl(codigo)) return;
    this.lightboxCodigoActual.set(codigo);
    this.lightboxVisible.set(true);
  }

  cerrarLightbox(): void {
    this.lightboxVisible.set(false);
  }

  constructor(private fb: FormBuilder) {
    this.maestroForm = this.fb.group({
      fecha: [new Date(), Validators.required],
      observacion: ['', Validators.required],
      bodega: ['BOD01'],
      bodegaDestino: ['BOD01'],
      tipoTransInv: ['ENT'],
      tipoMov: ['I'],
      contabilizar: [0],
      tipoMtto: ['A'],
      sucursal: ['SC0001'],
      documentoSujetoDevolucion: [false],
      existenciaFecDoc: [0],
      correlativoInv: ['EN'],
      aplicado: ['ELABORACION']
    });
    this.detalleForm = this.fb.group({
      LineaArticulo: ['', Validators.required],
      cantidad: [0, [Validators.required, Validators.min(0.01)]],
      precioUnitario: [0, [Validators.required, Validators.min(0.01)]],
      calidad: [0],
      tipoColor: ['NA'],
      cuentaContable: ['0'],
      centroCosto: ['0'],
      costoUnitario: [0, [Validators.required, Validators.min(0.01)]],
      idColor: [0],
      idAcabado: [''],
      precioMayoreo: [0, [Validators.min(0)]],
  cantidadMinimaMayoreo: [0, [Validators.min(0)]]
    });
    this.detalleForm.get('precioUnitario')?.valueChanges.subscribe(valor => {
    this.detalleForm.patchValue({
      costoUnitario: valor
    }, { emitEvent: false }); // false para no disparar eventos infinitos
  });
    this.cargarMovimientos();

    // Las imágenes del carrito solo se piden para la página actualmente visible (ver
    // detallesPagina) — nunca para las cientos de líneas que pueda tener el documento completo.
    effect(() => {
      this.detallesPagina();
      this.ensureCartImages();
    });
  }

  // Utilidades para fechas por defecto
  private getPrimerDiaMesAnterior(): string {
    const hoy = new Date();
    const primerDiaMesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    return primerDiaMesAnterior.toISOString().substring(0, 10);
  }
  private getFechaActual(): string {
    return new Date().toISOString().substring(0, 10);
  }
abrirDialogoArticulo() {
    this.showArticuloDialog.set(true);
    // Usamos setTimeout para asegurar que el componente hijo ya se renderizó en el DOM del Dialog
    setTimeout(() => {
      this.articuloChild()?.openCreate();
    }, 0);
  }

onArticuloCreado(codigoArticulo: string) {
    // 1. Obtener datos del hijo ANTES de cerrarlo
    const hijo = this.articuloChild();
    const descripcion = hijo?.articuloForm.get('Descripcion')?.value || 'Nuevo Artículo';
    const tieneImagen = !!hijo?.imagenPreview();

    // 2. Cerrar el modal
    this.showArticuloDialog.set(false);

    // 3. Crear el registro optimista ROBUSTO (con valores por defecto seguros)
    const nuevoArticulo: ArticuloPorBodegaDto = {
      ARTICULO: codigoArticulo,
      DESCRIPCION: descripcion,
      TIENE_IMAGEN: tieneImagen,
      ULTIMO_PRECIO: 0,
      PRECIO_MAYOREO: 0,
      cantidadmayoreo: 0,
      TIPO_ARTICULO: 'TM'
    };

    // 4. Inyectarlo al inicio de ambas listas de resultados visibles actualmente
    const display = this.toArticuloDisplay(nuevoArticulo);
    this.articuloListItemsByDisplay.set(display, nuevoArticulo);
    this.articuloListSuggestions.update(items => [display, ...items.filter(d => d !== display)]);
    this.articuloImgResults.update(items => [nuevoArticulo, ...items.filter(i => i.ARTICULO !== codigoArticulo)]);

    // 5. Seleccionarlo automáticamente (con precios en 0 iniciales)
    this.detalleForm.patchValue({
      LineaArticulo: display,
      precioUnitario: 0,
      precioMayoreo: 0,
      cantidadMinimaMayoreo: 0
    });
    this.articuloSeleccionadoCodigo.set(codigoArticulo);
    // Artículo recién creado: sin precio previo. Cualquier precio que se capture es un cambio.
    this.precioOrigUnidad = 0;
    this.precioOrigMayoreo = 0;
    this.cantMinOrigMayoreo = 0;

    // 6. FORZAR CARGA DE IMAGEN (pasamos 'true' para limpiar la caché de URL)
    if (tieneImagen) {
      this.ensureArticuloImageLoaded(codigoArticulo, { forceRefresh: true });
    }

    this.showInfo('Éxito', `Artículo ${codigoArticulo} registrado.`);

    // 7. Mover foco
    setTimeout(() => document.getElementById('cantidad-input')?.focus(), 150);

    // 8. Refrescar SOLO ese artículo desde la API (precio/imagen definitivos), dando tiempo
    // a que el backend termine de procesar el registro. Ya no se recarga el catálogo completo.
    setTimeout(() => {
      this.articulosLazyService.getArticulosPorBodegaLazy('BOD01', codigoArticulo, 0, 1).subscribe({
        next: (rows) => {
          const actualizado = (rows ?? [])[0];
          if (!actualizado) return;
          const displayActualizado = this.toArticuloDisplay(actualizado);
          this.articuloListItemsByDisplay.set(displayActualizado, actualizado);
          this.articuloImgResults.update(items => items.map(i => i.ARTICULO === codigoArticulo ? actualizado : i));
        }
      });
    }, 800);
  }
  nuevoIngreso() {
    this.modo.set('nuevo');
    this.maestroForm.reset({
      fecha: new Date(),
      observacion: '',
      bodega: 'BOD01',
      bodegaDestino: 'BOD01',
      tipoTransInv: 'ENT',
      tipoMov: 'I',
      contabilizar: 0,
      tipoMtto: 'A',
      sucursal: 'SC0001',
      documentoSujetoDevolucion: false,
      existenciaFecDoc: 0,
      correlativoInv: 'EN'
    });
    this.detalles.set([]);
    this.documentoInv.set(0);
    this.estadoDocumento.set('ELABORACION');
  }

  cargarMovimientos() {
    this.loading.set(true);
    const desde = this.fechaDesde();
    const hasta = this.fechaHasta();
    const mapaEstados: { [key: string]: string } = {
      'N': 'ELABORACION',
      'S': 'APLICADO'
    };
    this.api.getMovimientos(desde, hasta).subscribe({
      next: (data) => {
        // Aplicar el mapeo de estados
        const dataConEstados = data.map((item) => ({
          ...item,
          aplicado: mapaEstados[item.aplicado] || item.aplicado
        }));
        this.movimientos.set(dataConEstados);
      },
      error: () => this.movimientos.set([]),
      complete: () => this.loading.set(false)
    });
  }

  continuarMaestro() {
    if (!this.maestroForm.valid) return;
    const form = this.maestroForm.value;
    const dto: MovimientoInventarioGuardarDto = {
      documentoInv: 0,
      correlativoInv: form.correlativoInv || 'EN',
      fecha: (form.fecha instanceof Date ? form.fecha.toISOString().substring(0, 10) : form.fecha),
      comentario: form.observacion,
      bodega: form.bodega,
      bodegaDestino: form.bodegaDestino,
      tipoTransInv: form.tipoTransInv,
      tipoMov: form.tipoMov,
      contabilizar: form.contabilizar,
      tipoMtto: form.tipoMtto,
      sucursal: form.sucursal,
      documentoSujetoDevolucion: form.documentoSujetoDevolucion,
      existenciaFecDoc: form.existenciaFecDoc,
usuario: this.authService.currentUser()?.username ?? ''
    };
    this.api.guardarMovimiento(dto).subscribe({
      next: (resp) => {
        this.documentoInv.set(resp.documentoInv);
        this.modo.set('edicion');
        this.estadoDocumento.set('ELABORACION');
        this.cargarDetallesApi(resp.documentoInv);
        this.reiniciarBusquedaArticulos();
      }
    });
  }
  guardarCambios() {
    if (!this.maestroForm.valid) return;
    const form = this.maestroForm.value;
    const dto: MovimientoInventarioGuardarDto = {
      documentoInv: this.documentoInv(),
      correlativoInv: form.correlativoInv || 'EN',
      fecha: (form.fecha instanceof Date ? form.fecha.toISOString().substring(0, 10) : form.fecha),
      comentario: form.observacion,
      bodega: form.bodega,
      bodegaDestino: form.bodegaDestino,
      tipoTransInv: form.tipoTransInv,
      tipoMov: form.tipoMov,
      contabilizar: form.contabilizar,
      tipoMtto: 'C',
      sucursal: form.sucursal,
      documentoSujetoDevolucion: form.documentoSujetoDevolucion,
      existenciaFecDoc: form.existenciaFecDoc,
usuario: this.authService.currentUser()?.username ?? ''
    };
    this.api.guardarMovimiento(dto).subscribe({
      next: (resp) => {
        this.documentoInv.set(resp.documentoInv);
        this.modo.set('edicion');
        this.estadoDocumento.set('ELABORACION');
        this.cargarDetallesApi(resp.documentoInv);
      }
    });
    this.showInfo('Ingreso de Inventario', 'Actualizado correctamente.');
  }
    private showInfo(summary: string, detail: string) {
    this.messageService.add({ severity: 'info', summary, detail });
  }

  private showError(summary: string, detail: string) {
    this.messageService.add({ severity: 'error', summary, detail });
  }

  // ===== Listado: autocomplete con virtual scroll + lazy load =====

  private reiniciarBusquedaArticulos() {
    this.articuloListSuggestions.set([]);
    this.articuloListItemsByDisplay.clear();
    this.articuloListQuery = '';
    this.articuloListSkip = 0;
    this.articuloListHasMore = true;
    this.reiniciarBusquedaImagenes();
  }

  onArticuloListComplete(event: AutoCompleteCompleteEvent) {
    this.articuloListQuery = String(event.query ?? '');
    this.articuloListSkip = 0;
    this.articuloListHasMore = true;
    this.cargarPaginaListado(true);
  }

  onArticuloListLazyLoad(event: AutoCompleteLazyLoadEvent) {
    const last = Number(event.last ?? 0);
    const cargados = this.articuloListSuggestions().length;
    if (last >= cargados - 1 && this.articuloListHasMore && !this.articuloListLoadingFlag) {
      this.cargarPaginaListado(false);
    }
  }

  private cargarPaginaListado(reemplazar: boolean) {
    if (this.articuloListLoadingFlag) return;
    this.articuloListLoadingFlag = true;
    this.articuloListLoading.set(true);
    const skip = this.articuloListSkip;
    this.articulosLazyService.getArticulosPorBodegaLazy('BOD01', this.articuloListQuery, skip, this.articuloPageSize)
      .pipe(finalize(() => { this.articuloListLoadingFlag = false; this.articuloListLoading.set(false); }))
      .subscribe({
        next: (rows) => {
          const items = rows ?? [];
          const displays = items.map(item => this.toArticuloDisplay(item));
          items.forEach((item, idx) => this.articuloListItemsByDisplay.set(displays[idx], item));
          this.articuloListSuggestions.update(current => reemplazar ? displays : [...current, ...displays]);
          this.articuloListSkip = skip + items.length;
          this.articuloListHasMore = items.length === this.articuloPageSize;
        },
        error: () => { this.articuloListHasMore = false; }
      });
  }

  onArticuloListSelect(event: AutoCompleteSelectEvent) {
    const display = String(event.value ?? '').trim();
    const articulo = this.articuloListItemsByDisplay.get(display);
    if (!articulo) {
      this.articuloSeleccionadoCodigo.set(null);
      return;
    }
    this.selectArticuloCard(articulo);
  }

  // ===== Imágenes: grid con búsqueda y scroll infinito propios =====

  private reiniciarBusquedaImagenes() {
    this.articuloImgQuery.set('');
    this.articuloImgResults.set([]);
    this.articuloImgSkip = 0;
    this.articuloImgHasMore.set(true);
    if (this.articleViewMode() === 'imagenes') {
      this.cargarPaginaImagenes();
    }
  }

  private cargarPaginaImagenes() {
    if (this.articuloImgLoading() || !this.articuloImgHasMore()) return;
    this.articuloImgLoading.set(true);
    const skip = this.articuloImgSkip;
    this.articulosLazyService.getArticulosPorBodegaLazy('BOD01', this.articuloImgQuery(), skip, this.articuloPageSize)
      .pipe(finalize(() => this.articuloImgLoading.set(false)))
      .subscribe({
        next: (rows) => {
          const items = rows ?? [];
          this.articuloImgResults.update(current => [...current, ...items]);
          this.articuloImgSkip = skip + items.length;
          this.articuloImgHasMore.set(items.length === this.articuloPageSize);
          items.forEach(item => this.ensureArticuloImageLoaded(item.ARTICULO, { tieneImagen: item.TIENE_IMAGEN }));
        },
        error: () => this.articuloImgHasMore.set(false)
      });
  }

  onArticuloImgQueryChange(value: string) {
    this.articuloImgQuery.set(String(value ?? ''));
    clearTimeout(this.articuloImgSearchTimer);
    this.articuloImgSearchTimer = setTimeout(() => {
      this.articuloImgResults.set([]);
      this.articuloImgSkip = 0;
      this.articuloImgHasMore.set(true);
      this.cargarPaginaImagenes();
    }, 300);
  }

  onArticuloImgScroll(event: Event) {
    const el = event.target as HTMLElement;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
      this.cargarPaginaImagenes();
    }
  }

   private toArticuloDisplay(item: ArticuloPorBodegaDto): string {
    const codigo = String(item.ARTICULO ?? '').trim();
    const descripcion = String(item.DESCRIPCION ?? '').trim();
    return `${codigo} - ${descripcion}`;
  }

  // Precios del artículo al seleccionarlo (baseline para detectar cambios reales antes de actualizar).
  private precioOrigUnidad = 0;
  private precioOrigMayoreo = 0;
  private cantMinOrigMayoreo = 0;

  agregarDetalle() {
    if (!this.detalleForm.valid || !this.documentoInv()) return;
    const form = this.detalleForm.value;
    const username = this.authService.currentUser()?.username ?? '';
    const codigoArticulo = this.articuloSeleccionadoCodigo();
    if(!codigoArticulo) return;

    // Snapshot de precios ANTES de resetear el formulario. El precio se actualizará
    // únicamente si el movimiento se guarda (sin RAISERROR) y solo si realmente cambió.
    const precioUnitario = Number(form.precioUnitario ?? 0);
    const precioMayoreo = Number(form.precioMayoreo ?? 0);
    const cantidadMinimaMayoreo = Number(form.cantidadMinimaMayoreo ?? 0);
    const unidadCambio = precioUnitario !== this.precioOrigUnidad;
    const mayoreoCambio = precioMayoreo !== this.precioOrigMayoreo || cantidadMinimaMayoreo !== this.cantMinOrigMayoreo;

    const dto: DetalleMovimientoUpdateDto = {
      articulo: codigoArticulo,
      cantidad: form.cantidad,
      precioUnitario: form.precioUnitario,
      usuario: username,
      documentoInv: this.documentoInv()
    };
    this.loadingDetail.set(true);
    this.articuloSeleccionadoCodigo.set(null);
    this.api.guardarMovimientoDetalle(dto).subscribe({
      next: () => {
        // Regla 1: los precios se actualizan solo aquí (el SP no lanzó validación/RAISERROR).
        this.actualizarPreciosSiCambio(codigoArticulo, username, precioUnitario, precioMayoreo, cantidadMinimaMayoreo, unidadCambio, mayoreoCambio);
        this.detalleForm.reset({
          LineaArticulo: '',
          cantidad: 0,
          precioUnitario: 0,
          calidad: 0,
          tipoColor: 'NA',
          cuentaContable: '0',
          centroCosto: '0',
          costoUnitario: 0,
          idColor: 0,
          idAcabado: '',
          precioMayoreo: 0,
          cantidadMinimaMayoreo: 0
        });
        this.showInfo('Ingreso de Inventario', 'Producto agregado correctamente.');
        this.cargarDetallesApi(this.documentoInv()!);
      },
      error: (err) => {
        this.loadingDetail.set(false);
        const msg = err.error?.message || 'Error al agregar el producto.';
        this.showError('Ingreso de Inventario', msg);
      }
    });
  }

  aplicarDocumento() {
    if (!this.documentoInv()) return;
    if(!this.adminAccess()) {
      this.showError('Acceso Denegado', 'No tiene permisos para esta accion.');
      return;
    }

    this.api.aplicarMovimiento(this.documentoInv()!).subscribe({
      next: () =>{this.estadoDocumento.set('APLICADO');
        this.maestroForm.patchValue({ aplicado: 'APLICADO' });
        this.showInfo('Ingreso de Inventario', 'Documento aplicado correctamente.');

      }
    });

  }

  desaplicarDocumento() {
    if (!this.documentoInv()) return;
    if(!this.adminAccess()) {
      this.showError('Acceso Denegado', 'No tiene permisos para esta accion.');
      return;
    }
    this.api.desaplicarMovimiento(this.documentoInv()!).subscribe({
      next: () => {this.estadoDocumento.set('ELABORACION');
         this.showInfo('Ingreso de Inventario', 'Documento desaplicado correctamente.');
      this.maestroForm.patchValue({ aplicado: 'ELABORACION' });
      }
    });

  }

  editarDocumento(documentoInv: number) {
    this.modo.set('edicion');
    this.documentoInv.set(documentoInv);
    this.cargarDetallesApi(documentoInv);
    this.reiniciarBusquedaArticulos();
    const mov = this.movimientos().find(m => m.documentoInv === documentoInv);
    if (mov) {
      const fechaFormateada = new Date(mov.fecha).toISOString().split('T')[0];
       this.estadoDocumento.set(mov.aplicado);
      this.maestroForm.patchValue({
        documentoInv: mov.documentoInv,
        fecha: fechaFormateada,
        observacion: mov.comentario,
        aplicado: mov.aplicado
      });
    }
  }
solicitarEliminarDocumento(documentoInv: number) {
  if(!this.adminAccess()) {
      this.showError('Acceso Denegado', 'No tiene permisos para esta accion.');
      return;
    }
    this.eliminarConfirmDialog()?.abrir(() => this.eliminarDocumento(documentoInv));
  }

  eliminarDocumento(documentoInv: number) {
    this.api.eliminarMovimientoInventario(documentoInv).subscribe({
      next: () => {
        this.cargarMovimientos();
        this.modo.set('listado');
        this.showInfo('Ingreso de Inventario', 'Documento eliminado correctamente.');
      }
    });
  }

  cargarDetallesApi(documentoInv: number) {
    this.loadingDetail.set(true);
    this.detalleFiltro.set('');
    this.detallePagina.set(1);
    this.api.getMovimientoDetalle(documentoInv).subscribe({
      next: (data) => this.detallesApi.set(data),
      complete: () => this.loadingDetail.set(false),
      error: () => {
        this.detallesApi.set([]);
        this.loadingDetail.set(false);
      }
    });
  }

  cancelar() {
    this.modo.set('listado');
    this.documentoInv.set(0);
    this.detalles.set([]);
    this.cargarMovimientos();
  }

eliminarDetalle(docInv:number, correlativo: number) {
  if(!this.adminAccess()) {
      this.showError('Acceso Denegado', 'No tiene permisos para esta accion.');
      return;
    }
    if (!this.documentoInv()) return;
    docInv = this.documentoInv();
    this.api.eliminarMovimientoDetalle(docInv,correlativo).subscribe({
      next: (resp) => {this.cargarDetallesApi(this.documentoInv()!);
      this.showInfo('Ingreso de Inventario', 'Detalle eliminado correctamente.');
    }, error: (err) => {
      const errorMessage = err.error?.message || 'Ocurrió un error inesperado al guardar.';
      this.showError('Error de Inventario', errorMessage);
    }
    });

  }
  canSave(): boolean {
    return this.puedoEditar();
  }
   canApply(): boolean {
  return this.puedoEditar() && this.documentoInv()>0;
}

canDesaplicar(): boolean {
  return this.puedoDesaplicar();
}

currentEstado(): 'ELABORACION' | 'APLICADO' | 'ANULADO' | 'OTRO' {
  // Usamos .get() con ?. para que si el control no existe, no falle
  const estadoControl = this.maestroForm.get('aplicado');
  return estadoControl?.value || 'OTRO';
}

  setArticleViewMode(mode: 'listado' | 'imagenes') {
    this.articleViewMode.set(mode);
    if (mode === 'imagenes' && this.articuloImgResults().length === 0) {
      this.cargarPaginaImagenes();
    }
  }

  private ensureCartImages(): void {
    for (const det of this.detallesPagina()) {
      // Sin comprobación previa de catálogo: cada línea del carrito intenta su propia imagen
      // directamente; si el artículo no tiene imagen, la petición simplemente falla en silencio.
      this.ensureArticuloImageLoaded(String(det.articulo ?? '').trim());
    }
  }

private ensureArticuloImageLoaded(codigo: string, opts: { forceRefresh?: boolean; tieneImagen?: boolean } = {}): void {
    const key = String(codigo ?? '').trim();
    if (!key) return;

    if (opts.forceRefresh) {
      // Limpiar caché local y revocar el Blob anterior para forzar descarga
      const currentUrl = this.articuloImagenUrls()[key];
      if (currentUrl) URL.revokeObjectURL(currentUrl);

      this.articuloImagenUrls.update(urls => {
        const copy = { ...urls };
        delete copy[key];
        return copy;
      });
      this.articuloImagenLoading.delete(key);
    } else {
      if (this.articuloImagenUrls()[key] || this.articuloImagenLoading.has(key)) return;
      if (opts.tieneImagen === false) return;
    }

    this.articuloImagenLoading.add(key);

    // El servicio getArticuloImagen enviará ?_ts=... para romper el caché HTTP
    this.articulosService.getArticuloImagen(key, !!opts.forceRefresh).pipe(
      map((blob) => ({ codigo: key, url: URL.createObjectURL(blob) })),
      catchError(() => of(null)),
      finalize(() => this.articuloImagenLoading.delete(key))
    ).subscribe((result) => {
      if (result) {
        this.articuloImagenUrls.update((current) => ({
          ...current,
          [result.codigo]: result.url
        }));
      }
    });
  }
  selectArticuloCard(art: ArticuloPorBodegaDto) {
  const codigo = String(art.ARTICULO ?? '').trim();
  this.articuloSeleccionadoCodigo.set(codigo);

  // Sincronizamos con el formulario automáticamente
  const display = this.toArticuloDisplay(art);
  this.detalleForm.patchValue({
      LineaArticulo: display,
      precioUnitario: art.ULTIMO_PRECIO ?? art.ULTIMO_PRECIO ?? 0,
      precioMayoreo: art.PRECIO_MAYOREO ?? art.PRECIO_MAYOREO ?? 0,
      cantidadMinimaMayoreo: art.cantidadmayoreo ?? art.cantidadmayoreo ?? 0
    });
  // Baseline de precios del artículo, para detectar si el usuario realmente los cambió.
  this.precioOrigUnidad = Number(art.ULTIMO_PRECIO ?? 0);
  this.precioOrigMayoreo = Number(art.PRECIO_MAYOREO ?? 0);
  this.cantMinOrigMayoreo = Number(art.cantidadmayoreo ?? 0);
  this.showInfo('Selección', `Artículo ${codigo} seleccionado.`);
}
articuloImagenUrl(codigo: string): string | null {
    return this.articuloImagenUrls()[codigo] ?? null;
  }
  // Actualiza precios SOLO si hubo cambio real respecto al baseline del artículo (Regla 2).
  // El mayoreo, además, solo se guarda si tiene precio > 0 y cantidad mínima > 1.
  private actualizarPreciosSiCambio(
    articulo: string,
    usuario: string,
    precioUnitario: number,
    precioMayoreo: number,
    cantidadMinimaMayoreo: number,
    unidadCambio: boolean,
    mayoreoCambio: boolean
  ) {
    if (!articulo) return;
    if (!unidadCambio && !mayoreoCambio) return; // sin cambios: no se corre ningún update

    const guardarMayoreo = () => {
      if (!mayoreoCambio || precioMayoreo <= 0 || cantidadMinimaMayoreo <= 1) return;
      this.preciosService.guardarPrecio({
        articulo, tipoPrecioID: 2, precio: precioMayoreo, cantidadMinima: cantidadMinimaMayoreo, usuario
      }).subscribe({
        next: () => this.showInfo('Registro', 'Precios actualizados correctamente'),
        error: () => this.showError('Precio por mayoreo', 'No se pudo guardar el precio por mayoreo.')
      });
    };

    if (unidadCambio && precioUnitario > 0) {
      this.preciosService.guardarPrecio({
        articulo, tipoPrecioID: 1, precio: precioUnitario, cantidadMinima: 1, usuario
      }).subscribe({
        next: () => {
          if (mayoreoCambio) {
            guardarMayoreo();
          } else {
            this.showInfo('Registro', 'Precio por unidad actualizado');
          }
        },
        error: () => this.showError('Precio por unidad', 'No se pudo guardar el precio por unidad.')
      });
    } else {
      // La unidad no cambió (o quedó en 0): se intenta solo el mayoreo si cambió.
      guardarMayoreo();
    }
  }
selectInputText(event: any) {
  // PrimeNG a veces envuelve el evento. Buscamos el input real:
  const input = (event.originalEvent?.target || event.target) as HTMLInputElement;

  if (!input || input.readOnly || input.disabled) return;

  // El delay con requestAnimationFrame es CRUCIAL en p-inputNumber
  // porque PrimeNG realiza validaciones internas al ganar el foco.
  requestAnimationFrame(() => {
    if (typeof input.select === 'function') {
      input.select();
    }
  });
}
adminAccess(): boolean {
    const tipoUsuario = String(this.authService.currentUser()?.tipoUsuario ?? '').trim().toUpperCase();
    if (tipoUsuario === 'A') return true;
    return false;
  }
}
