import { Component, signal, computed, inject, viewChild } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { IngresosInventarioService, MovimientoInventarioGuardarDto, MovimientoInventarioDetalleGuardarDto, DetalleMovimientoUpdateDto } from './ingresos-inventario.service';
import { ArticuloPorBodegaDto } from '../../../core/models/facturacion.models';
import { FacturacionService } from '../../facturacion/services/facturacion';
import { AutoCompleteModule } from 'primeng/autocomplete';
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
import { Observable, catchError, finalize, forkJoin, map, of, switchMap } from 'rxjs';

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
  imports: [CommonModule, ReactiveFormsModule, ButtonModule, AutoCompleteModule,ToastModule, ProgressSpinnerModule, TagModule, InputNumberModule, DialogModule, ArticulosComponent],
   providers: [MessageService]
})
export class IngresosInventarioComponent {
  // Filtros de fecha para el listado
  fechaDesde = signal< string >(this.getPrimerDiaMesAnterior());
  fechaHasta = signal< string >(this.getFechaActual());

      private facturacionService = inject(FacturacionService);
      private authService = inject(AuthService);
        private messageService = inject(MessageService);
          private articulosService = inject(ArticulosService);
            private preciosService = inject(ArticuloPrecioService);
          private readonly articuloChunkSize = 80;
          showArticuloDialog = signal(false);
  articuloChild = viewChild(ArticulosComponent);
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
  articulosOptions = signal<ArticuloPorBodegaDto[]>([]);
  articuloSuggestions = signal<string[]>([]);
    articuloCardSearch = signal('');
  articleViewMode = signal<'listado' | 'imagenes'>('listado');
  articuloVisibleLimit = signal(this.articuloChunkSize);
  articuloImagenUrls = signal<Record<string, string>>({});
  articuloImagenDialogVisible = signal(false);
  // Agrega este Signal a tu clase
articuloSeleccionadoCodigo = signal<string | null>(null);
  private api = inject(IngresosInventarioService);
    selectedArticuloImagen = signal<ArticuloPorBodegaDto | null>(null);
  private articuloImagenLoading = new Set<string>();
filteredArticuloCards = computed(() => {
    const query = this.articuloCardSearch().trim().toLowerCase();
    const options = this.articulosOptions();
    if (!query) {
      return options;
    }

    return options.filter((item) => {
      const codigo = String(item.ARTICULO ?? '').toLowerCase();
      const descripcion = String(item.DESCRIPCION ?? '').toLowerCase();
      return codigo.includes(query) || descripcion.includes(query);
    });
  });
    articuloCardsRemaining = computed(() => {
    const remaining = this.filteredArticuloCards().length - this.articuloVisibleLimit();
    return remaining > 0 ? remaining : 0;
  });
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

    // 4. Inyectar limpiamente en los Signals locales
    this.articulosOptions.update(opts => {
      const filt = opts.filter(o => o.ARTICULO !== codigoArticulo);
      return [nuevoArticulo, ...filt];
    });
    
    const display = this.toArticuloDisplay(nuevoArticulo);
    this.articuloSuggestions.update(suggs => {
      const filt = suggs.filter(s => s !== display);
      return [display, ...filt];
    });

    // 5. Seleccionarlo automáticamente (con precios en 0 iniciales)
    this.detalleForm.patchValue({ 
      LineaArticulo: display,
      precioUnitario: 0,
      precioMayoreo: 0,
      cantidadMinimaMayoreo: 0
    });
    this.articuloSeleccionadoCodigo.set(codigoArticulo);
    
    // 6. FORZAR CARGA DE IMAGEN (pasamos 'true' para limpiar la caché de URL)
    if (tieneImagen) {
      this.ensureArticuloImageLoaded(codigoArticulo, true);
    }

    this.showInfo('Éxito', `Artículo ${codigoArticulo} registrado.`);
    
    // 7. Mover foco 
    setTimeout(() => document.getElementById('cantidad-input')?.focus(), 150);

    // 8. DELAY DE CONTROL: Esperamos 800ms antes de llamar a la BD 
    // para dar tiempo a la API de procesar el registro en base de datos.
    setTimeout(() => {
      this.CargarArticulos();
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
      }
    });
    this.CargarArticulos();
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

private CargarArticulos() {
    this.facturacionService.getArticulosPorBodega('BOD01').subscribe({
      next: (rows) => {
        let items = rows ?? [];
        
        // Fusión limpia por ID: Preservar el artículo seleccionado si la API viene con retraso
        const seleccionado = this.articuloSeleccionadoCodigo();
        if (seleccionado) {
          const enApi = items.find(a => a.ARTICULO === seleccionado);
          const enLocal = this.articulosOptions().find(a => a.ARTICULO === seleccionado);
          
          if (!enApi && enLocal) {
            items.unshift(enLocal);
          } else if (enApi && enLocal?.TIENE_IMAGEN) {
            enApi.TIENE_IMAGEN = true; 
          }
          
          // Autocompletar precios actualizados
          const actual = enApi || enLocal;
          if (actual) {
            this.detalleForm.patchValue({
              precioUnitario: actual.ULTIMO_PRECIO ?? actual.ULTIMO_PRECIO ?? 0,
              precioMayoreo: actual.PRECIO_MAYOREO ?? actual.PRECIO_MAYOREO ?? 0,
              cantidadMinimaMayoreo: actual.cantidadmayoreo ?? actual.cantidadmayoreo ?? 0
            }, { emitEvent: false });
          }
        }
        
        this.articulosOptions.set(items);
        this.articuloSuggestions.set(items.map((item) => this.toArticuloDisplay(item)));
      },
      error: () => {
        this.articulosOptions.set([]);
        this.articuloSuggestions.set([]);
      }
    });
  }
   private toArticuloDisplay(item: ArticuloPorBodegaDto): string {
    const codigo = String(item.ARTICULO ?? '').trim();
    const descripcion = String(item.DESCRIPCION ?? '').trim();
    return `${codigo} - ${descripcion}`;
  }

  agregarDetalle() {
    if (!this.detalleForm.valid || !this.documentoInv()) return;
    const form = this.detalleForm.value;
    const username = this.authService.currentUser()?.username ?? '';
    // Obtenemos el código limpio desde la señal
  const codigoArticulo = this.articuloSeleccionadoCodigo();
  if(!codigoArticulo) return;
    const dto: DetalleMovimientoUpdateDto = {
      articulo: codigoArticulo,
      cantidad: form.cantidad,
      precioUnitario: form.precioUnitario,
      usuario: username,
      documentoInv: this.documentoInv()
    };
    this.api.guardarMovimientoDetalle(dto).subscribe({
      next: () => {
        this.cargarDetallesApi(this.documentoInv()!);
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
      }
    });
    this.showInfo('Ingreso de Inventario', 'Producto agregado correctamente.');
    this.guardarDoblePrecio();
    this.articuloSeleccionadoCodigo.set(null);
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
    this.CargarArticulos();
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
eliminarDocumento(documentoInv: number) {
  if(!this.adminAccess()) {
      this.showError('Acceso Denegado', 'No tiene permisos para esta accion.');
      return;
    }
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
    this.api.getMovimientoDetalle(documentoInv).subscribe({
      next: (data) => {
        this.detallesApi.set(data);
      },
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

  onArticuloComplete(query: string) {
    const normalized = String(query ?? '').trim().toLowerCase();
    const options = this.articulosOptions().map((item) => this.toArticuloDisplay(item));

    if (!normalized) {
      this.articuloSuggestions.set(options);
      return;
    }

    this.articuloSuggestions.set(options.filter((item) => item.toLowerCase().includes(normalized)));
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
  onArticuloSelect(displayValue: string) {
    const display = String(displayValue ?? '').trim();
    const articulo = this.findArticuloByDisplay(display);

    if (!articulo) {
      this.detalleForm.patchValue({
        LineaArticulo: ''
      });
      this.articuloSeleccionadoCodigo.set(null);
      return;
    }

    // AUTOCOMPLETAR LOS PRECIOS AL SELECCIONAR
    this.detalleForm.patchValue({
      LineaArticulo: display,
      precioUnitario: articulo.ULTIMO_PRECIO ?? articulo.ULTIMO_PRECIO ?? 0,
      precioMayoreo: articulo.PRECIO_MAYOREO ?? articulo.PRECIO_MAYOREO ?? 0,
      cantidadMinimaMayoreo: articulo.cantidadmayoreo ?? articulo.cantidadmayoreo ?? 0
    });
    this.articuloSeleccionadoCodigo.set(articulo.ARTICULO);

  }

  private findArticuloByDisplay(displayValue: string): ArticuloPorBodegaDto | undefined {
    const normalized = String(displayValue ?? '').trim().toLowerCase();
    if (!normalized) {
      return undefined;
    }

    return this.articulosOptions().find((item) => {
      const codigo = String(item.ARTICULO ?? '').trim().toLowerCase();
      const descripcion = String(item.DESCRIPCION ?? '').trim().toLowerCase();
      const display = this.toArticuloDisplay(item).toLowerCase();
      return display === normalized || codigo === normalized || descripcion === normalized;
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
  visibleArticuloCards = computed(() => {
    const limit = this.articuloVisibleLimit();
    return this.filteredArticuloCards().slice(0, limit);
  });
  loadMoreArticuloCards() {
    this.articuloVisibleLimit.update((current) => current + this.articuloChunkSize);
    this.ensureVisibleArticuloImages();
  }
  private ensureVisibleArticuloImages(): void {
    if (this.articleViewMode() !== 'imagenes') {
      return;
    }

    for (const item of this.visibleArticuloCards()) {
      this.ensureArticuloImageLoaded(item.ARTICULO);
    }
  }
private ensureArticuloImageLoaded(codigo: string, forceRefresh: boolean = false): void {
    const key = String(codigo ?? '').trim();
    if (!key) return;

    if (forceRefresh) {
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
      const articulo = this.articulosOptions().find((item) => String(item.ARTICULO ?? '').trim() === key);
      if (!articulo?.TIENE_IMAGEN) return;
    }

    this.articuloImagenLoading.add(key);
    
    // El servicio getArticuloImagen enviará ?_ts=... para romper el caché HTTP
    this.articulosService.getArticuloImagen(key, forceRefresh).pipe(
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
  // private ensureArticuloImageLoaded(codigo: string): void {
  //     const key = String(codigo ?? '').trim();
  //     if (!key) {
  //       return;
  //     }
  
  //     const urls = this.articuloImagenUrls();
  //     if (urls[key] || this.articuloImagenLoading.has(key)) {
  //       return;
  //     }
  
  //     const articulo = this.articulosOptions().find((item) => String(item.ARTICULO ?? '').trim() === key);
  //     if (!articulo?.TIENE_IMAGEN) {
  //       return;
  //     }
  
  //     this.articuloImagenLoading.add(key);
  //     this.articulosService.getArticuloImagen(key).pipe(
  //       map((blob) => ({ codigo: key, url: URL.createObjectURL(blob) })),
  //       catchError(() => of(null)),
  //       finalize(() => this.articuloImagenLoading.delete(key))
  //     ).subscribe((result) => {
  //       if (!result) {
  //         return;
  //       }
  
  //       this.articuloImagenUrls.update((current) => ({
  //         ...current,
  //         [result.codigo]: result.url
  //       }));
  //     });
  //   }
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
  this.showInfo('Selección', `Artículo ${codigo} seleccionado.`);
}
articuloImagenUrl(codigo: string): string | null {
    return this.articuloImagenUrls()[codigo] ?? null;
  }
  guardarDoblePrecio() {
  if (this.detalleForm.invalid) return;

  const formValue = this.detalleForm.value;
  const articulosel = this.articuloSeleccionadoCodigo(); // Tu señal o variable del artículo
  const preciosel = formValue.precioUnitario ?? 0; // Precio por unidad del formulario
if(!articulosel || preciosel===0){
    this.showError('Error de validación', 'Debe seleccionar un artículo válido y precio valido.');
    return;
  }
  // 1. Preparar registro por Unidad (Tipo 1)
  const regUnidad = {
    articulo: articulosel,
    tipoPrecioID: 1,
    precio: preciosel,
    cantidadMinima: 1,
    usuario: this.authService.currentUser()?.username ?? ''
  };

  // 2. Ejecutar registro Obligatorio
  this.preciosService.guardarPrecio(regUnidad).subscribe({
    next: () => {
      // 3. Evaluar si se guarda el de Mayoreo (Opcional)
      if ((formValue.precioMayoreo ?? 0 > 0) && (formValue.cantidadMinimaMayoreo ?? 0 > 1)) {
        const preciomayoreo = formValue.precioMayoreo ?? 0;
        const cantidadmayoreo = formValue.cantidadMinimaMayoreo ?? 0;
        if (preciomayoreo === 0 || cantidadmayoreo === 0) {
          return;
        }
        const regMayoreo = {
          articulo: articulosel,
          tipoPrecioID: 2,
          precio: preciomayoreo,
          cantidadMinima: cantidadmayoreo,
          usuario: this.authService.currentUser()?.username ?? ''
        };
        
        this.preciosService.guardarPrecio(regMayoreo).subscribe({
          next: () => this.showInfo('Registro', 'Precios actualizados correctamente'),
          error: () => this.showError('Error al registrar precio por mayoreo', 'El precio por unidad se guardó, pero hubo un error al guardar el precio por mayoreo.')
        });
      } else {
        this.showInfo('Registro','Precio por unidad actualizado');
      }
    },
    error: () => this.showError('Error al registrar precio por unidad', 'No se pudo guardar el precio por unidad. El precio por mayoreo no se intentó guardar.')
  });
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
