import { Component, inject, signal, OnInit, computed, ChangeDetectionStrategy } from '@angular/core';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

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
    CheckboxModule, SelectModule
  ],
  providers: [MessageService]
})
export class AdminGestionPreciosComponent implements OnInit {
  private fb = inject(FormBuilder);
  private service = inject(GestionPreciosAdminService);
  private facturacionService = inject(FacturacionService);
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

  // Formulario Precios (Pilares 1, 2, 3)
  precioForm = this.fb.group({
    articulo: ['', [Validators.required]],
    tipoPrecioID: [1, [Validators.required]],
    precio: [0, [Validators.required, Validators.min(0)]],
    cantidadMinima: [1, [Validators.required, Validators.min(1)]]
  });

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
      error: (err) => this.showError('Error', err?.message || 'No se pudieron cargar precios'),
      complete: () => this.loading.set(false)
    });
  }

  cargarPromociones() {
    this.service.getPromociones().subscribe({
      next: (data) => this.promociones.set(data),
      error: () => {}
    });
  }

  cargarCrossSelling() {
    this.service.getCrossSelling().subscribe({
      next: (data) => this.crossSelling.set(data),
      error: () => {}
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

  // CRUD PRECIOS
  abrirNuevoPrecio() {
    this.precioForm.reset({ tipoPrecioID: 1, precio: 0, cantidadMinima: 1 });
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

    this.isSaving.set(true);
    this.service.guardarPrecio({
      articulo: cod,
      tipoPrecioID: val.tipoPrecioID ?? 1,
      precio: val.precio ?? 0,
      cantidadMinima: val.cantidadMinima ?? 1
    }).subscribe({
      next: (res) => {
        this.messageService.add({ severity: 'success', summary: 'Éxito', detail: res.message });
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
}
