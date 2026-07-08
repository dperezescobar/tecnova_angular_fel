import { Component, inject, signal, OnInit, computed, ChangeDetectionStrategy } from '@angular/core';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { catchError, finalize, map, of } from 'rxjs';

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
import { ArticuloPrecioVigenteResponse } from '../../../core/models/articulo-precio.models';
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
    const regUnidad = {
      articulo: articulosel,
      tipoPrecioID: 1,
      precio: preciosel,
      cantidadMinima: 1,
      usuario: this.authService.currentUser()?.username ?? ''
    };
    this.preciosService.guardarPrecio(regUnidad).subscribe({
      next: () => {
        const preciomayoreo = formValue.precioMayoreo ?? 0;
        const cantidadmayoreo = formValue.cantidadMinimaMayoreo ?? 0;
        if (preciomayoreo > 0 && cantidadmayoreo > 1) {
          const regMayoreo = {
            articulo: articulosel,
            tipoPrecioID: 2,
            precio: preciomayoreo,
            cantidadMinima: cantidadmayoreo,
            usuario: this.authService.currentUser()?.username ?? ''
          };
          this.preciosService.guardarPrecio(regMayoreo).subscribe({
            next: () => this.finalizarGuardado('Precios actualizados correctamente'),
            error: () => {
              this.isSaving.set(false);
              this.showError('Error al registrar precio por mayoreo', 'El precio por unidad se guardó, pero hubo un error al guardar el precio por mayoreo.');
            }
          });
        } else {
          this.finalizarGuardado('Precio por unidad actualizado');
        }
      },
      error: () => {
        this.isSaving.set(false);
        this.showError('Error al registrar precio por unidad', 'No se pudo guardar el precio por unidad.');
      }
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
