import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Observable, catchError, finalize, forkJoin, map, of, switchMap } from 'rxjs';

// PrimeNG Modules
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TagModule } from 'primeng/tag';
import { AuthService } from '../../../core/services/auth';

import { ArticuloPrecioService } from '../precios';
import { ArticuloPrecioVigenteResponse } from '../../../core/models/articulo-precio.models';
import { ArticuloPorBodegaDto } from '../../../core/models/facturacion.models';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { DrawerModule } from 'primeng/drawer';
import { IngresosInventarioService } from '../../inventario/ingresos-inventario/ingresos-inventario.service';
import { ArticulosService } from '../../articulos/services/articulos';
import { FacturacionService } from '../../facturacion/services/facturacion';

@Component({
  selector: 'app-gestion-precios',
  templateUrl: './articulo-precio.html',
  styleUrl: './articulo-precio.scss',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, TableModule, ButtonModule, 
    InputTextModule, InputNumberModule, DialogModule, ToastModule, TagModule, AutoCompleteModule, DrawerModule
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
  // Estados con Signals
  precios = signal<ArticuloPrecioVigenteResponse[]>([]);
  loading = signal(false);
  displayDialog = signal(false);
  isSaving = signal(false);
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
  // Formulario reactivo
  precioForm = this.fb.group({
    articulo: ['', [Validators.required, Validators.maxLength(40)]],
    tipoPrecioID: [1, [Validators.required]], // 1: Normal, 2: Mayoreo
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
    
  }

  cargarPrecios(articulo?: string) {
    this.loading.set(true);
    this.preciosService.obtenerPreciosVigentes(articulo).subscribe({
      next: (data) => this.precios.set(data),
      error: (error) => this.showError('Error al cargar precios', error?.message ?? 'Ocurrió un error al obtener los precios.'),
      complete: () => this.loading.set(false)
    });
    this.CargarArticulos();
  }
  private CargarArticulos(){
    this.facturacionService.getArticulosPorBodega('BOD01').subscribe({
        next: (rows) => {
          const items = rows ?? [];
          this.articulosOptions.set(items);
          this.articuloSuggestions.set(items.map((item) => this.toArticuloDisplay(item)));
        },
        error: () => {
          this.articulosOptions.set([]);
          this.articuloSuggestions.set([]);
        }
      });
  }
  abrirNuevo() {
    this.precioForm.reset({ tipoPrecioID: 1, precio: 0, cantidadMinima: 1, usuario: this.authService.currentUser()?.username ?? '' });
    this.displayDialog.set(true);
  }

  guardar() {
    if (this.precioForm.invalid) return;

    this.isSaving.set(true);
    const request = this.precioForm.value as any;

    this.preciosService.guardarPrecio(request).subscribe({
      next: (resp) => {
        this.messageService.add({ severity: 'success', summary: 'Éxito', detail: resp.message });
        this.displayDialog.set(false);
        this.cargarPrecios();
      },
      error: (err) => this.showError('Error al guardar',err.error?.message),
      complete: () => this.isSaving.set(false)
    });
  }

 private showInfo(summary: string, detail: string) {
    this.messageService.add({ severity: 'info', summary, detail });
  }

  private showError(summary: string, detail: string) {
    this.messageService.add({ severity: 'error', summary, detail });
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
    private ensureArticuloImageLoaded(codigo: string): void {
        const key = String(codigo ?? '').trim();
        if (!key) {
          return;
        }
    
        const urls = this.articuloImagenUrls();
        if (urls[key] || this.articuloImagenLoading.has(key)) {
          return;
        }
    
        const articulo = this.articulosOptions().find((item) => String(item.ARTICULO ?? '').trim() === key);
        if (!articulo?.TIENE_IMAGEN) {
          return;
        }
    
        this.articuloImagenLoading.add(key);
        this.articulosService.getArticuloImagen(key).pipe(
          map((blob) => ({ codigo: key, url: URL.createObjectURL(blob) })),
          catchError(() => of(null)),
          finalize(() => this.articuloImagenLoading.delete(key))
        ).subscribe((result) => {
          if (!result) {
            return;
          }
    
          this.articuloImagenUrls.update((current) => ({
            ...current,
            [result.codigo]: result.url
          }));
        });
      }
      selectArticuloCard(art: ArticuloPorBodegaDto) {
    const codigo = String(art.ARTICULO ?? '').trim();
    this.articuloSeleccionadoCodigo.set(codigo);
    
    // Sincronizamos con el formulario automáticamente
    this.precioForm.patchValue({
      articulo: codigo,
      descripcionarticulo: String(art.DESCRIPCION ?? '').trim()
    });
  
    this.showInfo('Selección', `Artículo ${codigo} seleccionado.`);
  }
  articuloImagenUrl(codigo: string): string | null {
      return this.articuloImagenUrls()[codigo] ?? null;
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
     private toArticuloDisplay(item: ArticuloPorBodegaDto): string {
    const codigo = String(item.ARTICULO ?? '').trim();
    const descripcion = String(item.DESCRIPCION ?? '').trim();
    return `${codigo} - ${descripcion}`;
  }
    onArticuloSelect(displayValue: string) {
    const display = String(displayValue ?? '').trim();
    const articulo = this.findArticuloByDisplay(display);

    if (!articulo) {
      this.precioForm.patchValue({
        articulo: '',
        descripcionarticulo: ''
      });
      return;
    }

    this.precioForm.patchValue({
      articulo: articulo.ARTICULO,
      descripcionarticulo: articulo.DESCRIPCION
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
  guardarDoblePrecio() {
  if (this.precioForm.invalid) return;

  const formValue = this.precioForm.value;
  const articulosel = this.articuloSeleccionadoCodigo(); // Tu señal o variable del artículo
  const preciosel = formValue.precioUnidad ?? 0; // Precio por unidad del formulario
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
          next: () => this.finalizarGuardado('Precios actualizados correctamente'),
          error: () => this.showError('Error al registrar precio por mayoreo', 'El precio por unidad se guardó, pero hubo un error al guardar el precio por mayoreo.')
        });
      } else {
        this.finalizarGuardado('Precio por unidad actualizado');
      }
    },
    error: () => this.showError('Error al registrar precio por unidad', 'No se pudo guardar el precio por unidad. El precio por mayoreo no se intentó guardar.')
  });
}

private finalizarGuardado(msj: string) {
  this.messageService.add({ severity: 'success', summary: 'Éxito', detail: msj });
  this.displayDialog.set(false);
  this.cargarPrecios(); // Recargar la tabla
}
}