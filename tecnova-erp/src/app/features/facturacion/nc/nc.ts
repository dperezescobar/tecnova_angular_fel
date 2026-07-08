import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ViewChild,
  computed,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Observable, catchError, finalize, forkJoin, from, map, of, switchMap, tap } from 'rxjs';

import { ButtonModule } from 'primeng/button';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { InputTextModule } from 'primeng/inputtext';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ToastModule } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';

import { AuthService } from '../../../core/services/auth';
import {
  AnulacionFacturaDto,
  CcfParaNcDto,
  CondicionPagoCatalogoDto,
  DeleteFacturaDto,
  ParametrosDteDto,
  RespuestaDteDto,
  EmisionStep,
  FacturaDetalleDto,
  FacturaEncabezadoDto,
  FacturaGeneralDto,
  NcModo,
  PerfilClienteDto,
  SucursalPuntoVendedorDto,
  UpdateDetalleFacturaDescuentoDto,
  UpdateDetalleFacturaDto,
  UpdateFacturacionAplicacionDto,
  UpdateFacturaDevolucionDto,
  UpdateFacturaDto
} from '../../../core/models/facturacion.models';
import { FacturacionService } from '../services/facturacion';
import { ReenviarCorreoDialogComponent } from '../../../shared/components/reenviar-correo-dialog/reenviar-correo-dialog';
import { EliminarConfirmDialogComponent } from '../../../shared/components/eliminar-confirm-dialog/eliminar-confirm-dialog';

interface NcLinea {
  linea: number;
  articulo: string;
  descripcion: string;
  calidad: string;
  cantidad: number;
  precioUnitario: number;
  costoUnitario: number;
  bodega: string;
  unidadMedida: string;
  tipoColor: string;
  idColor: number;
  idAcabado: string;
  cantidadDevolucion: number;
  montoDescuento: number;
  maxDescuento: number;
  subtotal: number;
  iva: number;
  impuesto2: number;
  impuesto3: number;
  isDirty: boolean;
}

@Component({
  selector: 'app-nc',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    AutoCompleteModule,
    InputTextModule,
    ProgressSpinnerModule,
    ToastModule,
    DialogModule,
    SelectModule,
    ReenviarCorreoDialogComponent,
    EliminarConfirmDialogComponent
  ],
  providers: [MessageService],
  templateUrl: './nc.html',
  styleUrls: ['./nc.scss']
})
export class NcComponent {
  @ViewChild(ReenviarCorreoDialogComponent) reenviarCorreoDialog!: ReenviarCorreoDialogComponent;
  @ViewChild(EliminarConfirmDialogComponent) eliminarConfirmDialog!: EliminarConfirmDialogComponent;

  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);
  private authService = inject(AuthService);
  private facturacionService = inject(FacturacionService);
  private messageService = inject(MessageService);
  private currencyFormatter = new Intl.NumberFormat('es-SV', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });

  // ── List view ────────────────────────────────────────────────────────────
  loadingList = signal(false);
  facturas = signal<FacturaGeneralDto[]>([]);
  selectedFactura = signal<FacturaGeneralDto | null>(null);
  dateDesde = signal<string>(this.todayMinus30());
  dateHasta = signal<string>(this.today());
  searchText = signal('');
  showDetail = signal(false);

  // ── Detail ───────────────────────────────────────────────────────────────
  loadingDetail = signal(false);
  saving = signal(false);
  isLocked = signal(false);
  hasSavedCurrentRecord = signal(false);

  // ── NC mode ──────────────────────────────────────────────────────────────
  ncModo = signal<NcModo>('DESCUENTO');
  aplicaInventarios = signal(false);

  // ── CCF picker ───────────────────────────────────────────────────────────
  ccfPickerVisible = signal(false);
  ccfPickerBusqueda = signal('');
  ccfPickerPage = signal(1);
  ccfPickerHasMore = signal(true);
  loadingCcfs = signal(false);
  ccfPickerItems = signal<CcfParaNcDto[]>([]);
  selectedCcf = signal<CcfParaNcDto | null>(null);
  ccfVinculado = signal(false);
  loadingCcfDetalle = signal(false);
  previewLoading = signal(false);
  quitarCcfDialogVisible = signal(false);

  // ── NC lines ─────────────────────────────────────────────────────────────
  ncLineas = signal<NcLinea[]>([]);
  ncLineasExcluidas = signal<NcLinea[]>([]);

  // ── Estado local del documento (independiente de selectedFactura) ────────
  ncEstadoActual = signal<string>('');

  // ── DTE ──────────────────────────────────────────────────────────────────
  emitting = signal(false);
  emisionPanelOpen = signal(false);
  emisionSteps = signal<EmisionStep[]>([]);
  anulacionDialogVisible = signal(false);
  anulacionMotivo = signal('');
  anulandoDte = signal(false);

  // ── Catalogs ─────────────────────────────────────────────────────────────
  sucursalPuntoRows = signal<SucursalPuntoVendedorDto[]>([]);
  clientesOptions = signal<PerfilClienteDto[]>([]);
  clienteSuggestions = signal<PerfilClienteDto[]>([]);
  condicionPagoOptions = signal<CondicionPagoCatalogoDto[]>([]);
  selectedSucursal = signal<string>('');

  // ── Form ─────────────────────────────────────────────────────────────────
  facForm = this.fb.group({
    CodGeneracion: [''],
    Cliente: [''],
    FacturarA: [''],
    Fecha: [this.today()],
    CondicionPago: ['CONTADO'],
    TipoVenta: ['G'],
    Vendedor: [''],
    Observaciones: [''],
    Sucursal: [''],
    PuntoVenta: [''],
    NIT: [''],
    RegistroComercio: [''],
    Identificacion: [''],
    CorreoElectronico: [''],
    IdFactura: [0],
    NoControl: [''],
    SelloRecepcion: [''],
    IdDTE: [0]
  });

  // ── Computed ─────────────────────────────────────────────────────────────
  filteredFacturas = computed(() => {
    const q = this.searchText().toLowerCase();
    if (!q) return this.facturas();
    return this.facturas().filter(
      (f) =>
        f.FACTURAR_A?.toLowerCase().includes(q) ||
        f.CLIENTE?.toLowerCase().includes(q) ||
        f.Factura?.toLowerCase().includes(q)
    );
  });

  sucursalOptions = computed(() => {
    const seen = new Set<string>();
    return this.sucursalPuntoRows()
      .filter((r) => { const ok = !seen.has(r.Sucursal); seen.add(r.Sucursal); return ok; })
      .map((r) => ({ label: r.NombreSC || r.Sucursal, value: r.Sucursal }));
  });

  puntoVentaOptions = computed(() => {
    const s = this.selectedSucursal();
    return this.sucursalPuntoRows()
      .filter((r) => r.Sucursal === s)
      .map((r) => ({ label: r.NombrePV || r.PUNTO_VENTA, value: r.PUNTO_VENTA }));
  });

  sumasNc = computed(() => this.roundAmount(this.ncLineas().reduce((s, l) => s + l.subtotal, 0)));
  ivaNc = computed(() => this.roundAmount(this.ncLineas().reduce((s, l) => s + l.iva, 0)));
  totalNc = computed(() => this.roundAmount(this.sumasNc() + this.ivaNc()));

  ncEstado = computed(() => this.ncEstadoActual().toUpperCase());

  canSave = computed(() => {
    const e = this.ncEstado();
    return e === 'ELABORACION' || e === '';
  });

  canApply = computed(() => {
    const estado = this.ncEstado();
    const saved = this.hasSavedCurrentRecord();
    return (estado === 'ELABORACION' || (saved && estado === '')) &&
      saved &&
      this.ncLineas().length > 0;
  });

  canDesapply = computed(() => this.ncEstado() === 'APLICADO');
  canAnular = computed(() => this.ncEstado() === 'APLICADO');
  hasUnsavedLines = computed(() => this.ncLineas().some((l) => l.isDirty));

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  constructor() {
    this.loadCatalogs();
  }

  private loadCatalogs() {
    const username = this.authService.currentUser()?.username ?? '';
    forkJoin({
      sucursal: this.facturacionService.getSucursalPuntoVendedor(username),
      clientes: this.facturacionService.getPerfilClientes(),
      condicion: this.facturacionService.getCatalogoCondicionPago(),
      inventarios: this.facturacionService.getAplicaInventarios()
    }).subscribe({
      next: ({ sucursal, clientes, condicion, inventarios }) => {
        this.sucursalPuntoRows.set(sucursal ?? []);
        this.clientesOptions.set(clientes ?? []);
        this.clienteSuggestions.set(clientes ?? []);
        this.condicionPagoOptions.set(condicion ?? []);
        this.aplicaInventarios.set(inventarios);
        this.applyDefaultSucursalPunto();
        this.loadMaestro();
        this.cdr.markForCheck();
      },
      error: () => this.loadMaestro()
    });
  }

  // ── List (maestro) ────────────────────────────────────────────────────────
  loadMaestro() {
    this.loadingList.set(true);
    this.facturacionService
      .getNotasCredito(this.dateDesde(), this.dateHasta())
      .pipe(finalize(() => { this.loadingList.set(false); this.cdr.markForCheck(); }))
      .subscribe({
        next: (rows) => this.facturas.set(rows ?? []),
        error: () => this.facturas.set([])
      });
  }

  onFiltroFechaChange() {
    this.facturacionService['invalidateCacheByPrefix']('notasCredito:');
    this.loadMaestro();
  }

  // ── Delete NC ─────────────────────────────────────────────────────────────
  canEliminarNc(item: FacturaGeneralDto): boolean {
    return (item.ESTADO ?? '').toUpperCase() === 'ELABORACION';
  }

  solicitarEliminarNc(item: FacturaGeneralDto) {
    if (!this.canEliminarNc(item)) {
      this.showError('Solo NC en elaboración pueden eliminarse.');
      return;
    }
    this.eliminarConfirmDialog.abrir(() => this.eliminarNc(item));
  }

  onReenviarCorreo(item: FacturaGeneralDto): void {
    const idEmpresa = this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0;
    const idFactura = this.toNumber(item.iddoc);
    const perfil = this.clientesOptions().find((c) => String(c.CLIENTE ?? '').trim() === String(item.CLIENTE ?? '').trim());
    const correoDefault = String(perfil?.CORREO_ELECTRONICO ?? '').trim();
    this.reenviarCorreoDialog.abrir(idEmpresa, idFactura, 'NC', correoDefault);
  }

  eliminarNc(item: FacturaGeneralDto) {
    if (!this.canEliminarNc(item)) {
      this.showError('Solo NC en elaboración pueden eliminarse.');
      return;
    }
    const payload: DeleteFacturaDto = {
      Prefijo: String(item.Prefijo ?? '').trim(),
      Factura: String(item.Factura ?? '').trim(),
      Sucursal: this.resolveSucursalFromNc(item),
      PuntoVenta: String(item.PUNTO_VENTA ?? '').trim(),
      TipoFactura: 'NC',
      Fecha: this.resolveNcDate(item.FECHA)
    };
    this.facturacionService.deleteFactura(payload).subscribe({
      next: () => {
        this.showInfo('Nota de Crédito eliminada correctamente.');
        this.facturacionService['invalidateCacheByPrefix']('notasCredito:');
        this.loadMaestro();
      },
      error: (err) => this.showError(this.extractError(err, 'No se pudo eliminar la NC.'))
    });
  }

  private resolveSucursalFromNc(item: FacturaGeneralDto): string {
    const codigo = String(item.CODIGOSUCURSAL ?? '').trim();
    return codigo || String(item.SUCURSAL ?? '').trim();
  }

  private resolveNcDate(value: unknown): string {
    const raw = String(value ?? '').trim().split(' ')[0];
    if (!raw) return new Date().toISOString().split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const parts = raw.split('/');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    return new Date().toISOString().split('T')[0];
  }

  // ── New NC ────────────────────────────────────────────────────────────────
  nuevaNc() {
    const hoy = this.today();
    this.selectedFactura.set(null);
    this.selectedCcf.set(null);
    this.ccfVinculado.set(false);
    this.ncLineas.set([]);
    this.ncLineasExcluidas.set([]);
    this.ncModo.set('DESCUENTO');
    this.hasSavedCurrentRecord.set(false);
    this.isLocked.set(false);
    this.ncEstadoActual.set('');

    this.facForm.reset({
      CodGeneracion: crypto.randomUUID().toUpperCase(),
      Cliente: '', FacturarA: '', Fecha: hoy,
      CondicionPago: 'CONTADO', TipoVenta: 'G',
      Vendedor: '', Observaciones: '',
      Sucursal: '', PuntoVenta: '', NIT: '', RegistroComercio: '',
      Identificacion: '', CorreoElectronico: '',
      IdFactura: 0, NoControl: '', SelloRecepcion: '', IdDTE: 0
    });

    this.applyDefaultSucursalPunto();
    this.showDetail.set(true);
    this.cdr.markForCheck();
  }

  openEdit(item: FacturaGeneralDto) {
    const idEmpresa = this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0;
    const sucursal = String(item.CODIGOSUCURSAL || item.SUCURSAL || '').trim();
    const puntoVenta = String(item.PUNTO_VENTA || '').trim();

    this.selectedFactura.set(item);
    this.hasSavedCurrentRecord.set(true);
    this.showDetail.set(true);
    this.loadingDetail.set(true);
    this.ncLineas.set([]);
    this.selectedCcf.set(null);
    this.ccfVinculado.set(false);

    forkJoin({
      encabezado: this.facturacionService.getFacturaEncabezado(item.Prefijo, item.Factura, sucursal, puntoVenta, idEmpresa),
      detalle: this.facturacionService.getFacturaDetalle(item.Prefijo, item.Factura, sucursal, puntoVenta, 'NC'),
      ccf: this.facturacionService.getCcfVinculadoNc(item.Prefijo, item.Factura, sucursal, puntoVenta).pipe(catchError(() => of(null)))
    })
      .pipe(finalize(() => { this.loadingDetail.set(false); this.cdr.markForCheck(); }))
      .subscribe({
        next: ({ encabezado, detalle, ccf }) => {
          this.patchEncabezado(encabezado);
          const lineas = (detalle ?? []).map((d) => this.ncLineaFromDetalle(d, true));
          this.ncLineas.set(lineas);
          this.ncEstadoActual.set(this.normalizeEstado(encabezado.Estado));
          this.isLocked.set(this.normalizeEstado(encabezado.Estado) !== 'ELABORACION');
          if (ccf) {
            this.selectedCcf.set(ccf);
            this.ccfVinculado.set(true);
          }
        },
        error: () => this.showError('Error al cargar NC')
      });
  }

  closeDetail() {
    this.facturacionService['invalidateCacheByPrefix']('notasCredito:');
    this.showDetail.set(false);
    this.emisionPanelOpen.set(false);
    this.loadMaestro();
  }

  goBack() { this.closeDetail(); }

  // ── Client autocomplete ───────────────────────────────────────────────────
  onSearchClientes(event: { query: string }) {
    const q = (event.query ?? '').toLowerCase();
    const filtered = this.clientesOptions().filter(
      (c) =>
        c.NOMBRE?.toLowerCase().includes(q) ||
        c.CLIENTE?.toLowerCase().includes(q) ||
        c.NIT?.toLowerCase().includes(q)
    );
    this.clienteSuggestions.set(filtered);
    this.cdr.markForCheck();
  }

  onSelectCliente(event: { value: PerfilClienteDto }) {
    const perfil = event.value;
    this.facForm.patchValue({
      Cliente: perfil.CLIENTE,
      FacturarA: perfil.NOMBRE,
      NIT: perfil.NIT,
      RegistroComercio: perfil.REGISTRO_COMERCIO,
      Identificacion: perfil.IDENTIFICACION,
      CorreoElectronico: perfil.CORREO_ELECTRONICO,
      CondicionPago: perfil.CONDICION_PAGO || 'CONTADO',
      Vendedor: perfil.VENDEDOR || ''
    });
    this.cdr.markForCheck();
  }

  clienteDisplayFn(cliente: PerfilClienteDto | string): string {
    if (!cliente) return '';
    if (typeof cliente === 'string') return cliente;
    return `${cliente.NOMBRE} (${cliente.CLIENTE})`;
  }

  // ── CCF picker ────────────────────────────────────────────────────────────
  onBuscarCcf() {
    const cliente = String(this.facForm.controls.Cliente.value ?? '').trim();
    if (!cliente) {
      this.showError('Seleccione un cliente antes de buscar CCFs.');
      return;
    }
    this.ccfPickerPage.set(1);
    this.ccfPickerHasMore.set(true);
    this.ccfPickerItems.set([]);
    this.ccfPickerVisible.set(true);
    this.loadCcfs(1, true);
    this.cdr.markForCheck();
  }

  private loadCcfs(pagina: number, reset: boolean = false) {
    const cliente = String(this.facForm.controls.Cliente.value ?? '').trim();
    this.loadingCcfs.set(true);
    this.facturacionService
      .getCcfsPorCliente(cliente, pagina, this.ccfPickerBusqueda())
      .pipe(finalize(() => { this.loadingCcfs.set(false); this.cdr.markForCheck(); }))
      .subscribe({
        next: (rows) => {
          const items = rows ?? [];
          const merged = reset ? items : [...this.ccfPickerItems(), ...items];
          const sorted = [...merged].sort((a, b) =>
            new Date(b.Fecha).getTime() - new Date(a.Fecha).getTime()
          );
          this.ccfPickerItems.set(sorted);
          const totalRegistros = items[0]?.TotalRegistros ?? 0;
          this.ccfPickerHasMore.set(sorted.length < totalRegistros);
        },
        error: () => {}
      });
  }

  onCcfPickerBusquedaChange(value: string) {
    this.ccfPickerBusqueda.set(value);
    this.ccfPickerPage.set(1);
    this.loadCcfs(1, true);
  }

  onCcfPickerScroll(event: Event) {
    const el = event.target as HTMLElement;
    if (!this.ccfPickerHasMore() || this.loadingCcfs()) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
      const nextPage = this.ccfPickerPage() + 1;
      this.ccfPickerPage.set(nextPage);
      this.loadCcfs(nextPage, false);
    }
  }

  onSelectCcf(ccf: CcfParaNcDto) {
    this.selectedCcf.set(ccf);
    this.ccfPickerVisible.set(false);
    this.loadingCcfDetalle.set(true);
    this.ncLineas.set([]);

    this.facturacionService
      .getFacturaDetalle(ccf.Prefijo, ccf.Factura, ccf.Sucursal, ccf.PuntoVenta, 'CCF')
      .pipe(finalize(() => { this.loadingCcfDetalle.set(false); this.cdr.markForCheck(); }))
      .subscribe({
        next: (detalle) => {
          const lineas = (detalle ?? []).map((d) => this.ncLineaFromDetalle(d, false));
          this.ncLineas.set(lineas);
          this.ncLineasExcluidas.set([]);
          this.cdr.markForCheck();
          this.guardar();
        },
        error: () => this.showError('No se pudo cargar el detalle del CCF.')
      });
  }

  // ── Quitar CCF vinculado ──────────────────────────────────────────────────
  solicitarQuitarCcf() {
    if (this.isLocked() || !this.selectedCcf() || this.saving()) return;
    this.quitarCcfDialogVisible.set(true);
  }

  cancelarQuitarCcf() {
    this.quitarCcfDialogVisible.set(false);
  }

  confirmarQuitarCcf() {
    this.quitarCcfDialogVisible.set(false);
    const ccf = this.selectedCcf();
    if (!ccf) return;

    const lineasPersistidas = this.ncLineas().filter((l) => l.linea > 0);
    const debeLlamarBackend = this.hasSavedCurrentRecord() && (this.ccfVinculado() || lineasPersistidas.length > 0);

    if (!debeLlamarBackend) {
      this.selectedCcf.set(null);
      this.ncLineas.set([]);
      this.ncLineasExcluidas.set([]);
      this.ccfVinculado.set(false);
      return;
    }

    const raw = this.facForm.getRawValue();
    const codGen = String(raw.CodGeneracion ?? '').trim();
    const sucursal = String(raw.Sucursal ?? '').trim();
    const puntoVenta = String(raw.PuntoVenta ?? '').trim();
    const username = this.authService.currentUser()?.username ?? '';
    const prefijoNc = codGen.substring(0, 18);
    const facturaNc = codGen.substring(18, 36);

    this.saving.set(true);
    from(this.eliminarLineasPersistidas(lineasPersistidas, codGen, sucursal, puntoVenta, username))
      .pipe(
        switchMap(() => {
          if (!this.ccfVinculado()) {
            return of(null);
          }
          return this.facturacionService.updateFacturaDevolucion({
            PrefijoNc: prefijoNc,
            FacturaNc: facturaNc,
            SucursalNc: sucursal,
            PuntoVentaNc: puntoVenta,
            TipoFacturaNc: 'NC',
            PrefijoCcf: ccf.Prefijo,
            FacturaCcf: ccf.Factura,
            SucursalCcf: ccf.Sucursal,
            PuntoVentaCcf: ccf.PuntoVenta,
            TipoFacturaCcf: ccf.TipoFactura || 'CCF',
            TipoMtto: 'B',
            Usuario: username
          } as UpdateFacturaDevolucionDto);
        }),
        finalize(() => { this.saving.set(false); this.cdr.markForCheck(); })
      )
      .subscribe({
        next: () => {
          this.selectedCcf.set(null);
          this.ncLineas.set([]);
          this.ncLineasExcluidas.set([]);
          this.ccfVinculado.set(false);
          this.showInfo('CCF removido. Seleccione otro CCF para continuar.');
          this.facturacionService['invalidateCacheByPrefix']('notasCredito:');
        },
        error: (err) => this.showError(this.extractError(err, 'No se pudo quitar el CCF vinculado.'))
      });
  }

  private async eliminarLineasPersistidas(
    lineas: NcLinea[],
    codGen: string,
    sucursal: string,
    puntoVenta: string,
    username: string
  ): Promise<void> {
    for (const linea of lineas) {
      await this.deleteNcLineaObs(linea, codGen, sucursal, puntoVenta, username).toPromise();
    }
  }

  // ── Mode toggle ───────────────────────────────────────────────────────────
  setModo(modo: NcModo) {
    if (this.isLocked()) return;
    this.ncModo.set(modo);
  }

  // ── Line editing ──────────────────────────────────────────────────────────
  onMontoDescuentoChange(linea: NcLinea, value: number) {
    linea.montoDescuento = Math.min(Math.max(0.01, value), linea.maxDescuento);
    linea.isDirty = true;
    this.recalcLinea(linea, 'DESCUENTO');
    this.ncLineas.set([...this.ncLineas()]);
    this.cdr.markForCheck();
  }

  onCantidadDevolucionChange(linea: NcLinea, value: number) {
    linea.cantidadDevolucion = Math.min(Math.max(0, value), linea.cantidad);
    linea.isDirty = true;
    this.recalcLinea(linea, 'DEVOLUCION');
    this.ncLineas.set([...this.ncLineas()]);
    this.cdr.markForCheck();
  }

  onDescripcionChange(linea: NcLinea, value: string) {
    linea.descripcion = value;
    linea.isDirty = true;
    this.ncLineas.set([...this.ncLineas()]);
    this.cdr.markForCheck();
  }

  eliminarLinea(linea: NcLinea) {
    this.ncLineas.set(this.ncLineas().filter((l) => l !== linea));
    this.ncLineasExcluidas.update((prev) => [...prev, { ...linea, isDirty: false }]);
    this.cdr.markForCheck();
  }

  restaurarLinea(linea: NcLinea) {
    this.ncLineasExcluidas.set(this.ncLineasExcluidas().filter((l) => l !== linea));
    this.ncLineas.update((prev) => [...prev, { ...linea, isDirty: true }]);
    this.cdr.markForCheck();
  }

  private recalcLinea(linea: NcLinea, modo: NcModo) {
    if (modo === 'DESCUENTO') {
      // montoDescuento is the NET amount; IVA = net × 13%
      linea.subtotal = linea.montoDescuento;
      linea.iva = this.roundAmount(linea.montoDescuento * 0.13);
    } else {
      // precioUnitario is net; net amount = cantidadDevolucion × precioUnitario
      const netAmount = this.roundAmount(linea.cantidadDevolucion * linea.precioUnitario);
      linea.subtotal = netAmount;
      linea.iva = this.roundAmount(netAmount * 0.13);
    }
    linea.impuesto2 = 0;
    linea.impuesto3 = 0;
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  guardar() {
    if (!this.canSave()) {
      this.showError('Solo NC en ELABORACION pueden guardarse.');
      return;
    }
    const cliente = String(this.facForm.controls.Cliente.value ?? '').trim();
    if (!cliente) {
      this.showError('Seleccione un cliente antes de guardar.');
      return;
    }
    if (this.ncLineas().length === 0) {
      this.showError('Seleccione un CCF y cargue las líneas antes de guardar.');
      return;
    }
    const modo = this.ncModo();
    const lineaInvalida = this.ncLineas().find((l) =>
      modo === 'DESCUENTO' ? l.montoDescuento <= 0 : l.cantidadDevolucion <= 0
    );
    if (lineaInvalida) {
      this.showError(`La línea "${lineaInvalida.articulo}" tiene un valor de cero. Corrija antes de guardar.`);
      return;
    }

    this.saving.set(true);
    const headerPayload = this.buildHeaderPayload();
    const ccf = this.selectedCcf();
    const needsLinkCcf = !!ccf && !this.ccfVinculado();

    this.facturacionService
      .updateFactura(headerPayload)
      .pipe(
        tap((res: any) => {
          if (res?.idFactura) {
            this.facForm.patchValue({ IdFactura: res.idFactura });
          }
        }),
        switchMap(() => {
          if (needsLinkCcf && ccf) {
            const prefijoNc = String(headerPayload.CodGeneracion).substring(0, 18);
            const facturaNc = String(headerPayload.CodGeneracion).substring(headerPayload.CodGeneracion.length - 18, headerPayload.CodGeneracion.length);
            return this.facturacionService.updateFacturaDevolucion({
              PrefijoNc: prefijoNc,
              FacturaNc: facturaNc,
              SucursalNc: headerPayload.Sucursal,
              PuntoVentaNc: headerPayload.PuntoVenta,
              TipoFacturaNc: 'NC',
              PrefijoCcf: ccf.Prefijo,
              FacturaCcf: ccf.Factura,
              SucursalCcf: ccf.Sucursal,
              PuntoVentaCcf: ccf.PuntoVenta,
              TipoFacturaCcf: ccf.TipoFactura || 'CCF',
              TipoMtto: 'A',
              Usuario: this.authService.currentUser()?.username ?? ''
            } as UpdateFacturaDevolucionDto);
          }
          return of(null);
        }),
        switchMap(() => from(this.saveAllLines())),
        switchMap(() => this.reloadNcLineasDesdeBackend()),
        finalize(() => { this.saving.set(false); this.cdr.markForCheck(); })
      )
      .subscribe({
        next: (lineasActualizadas) => {
          this.hasSavedCurrentRecord.set(true);
          this.ncEstadoActual.set('ELABORACION');
          if (needsLinkCcf) {
            this.ccfVinculado.set(true);
          }
          this.ncLineas.set(lineasActualizadas);
          this.showInfo('NC guardada correctamente.');
          this.facturacionService['invalidateCacheByPrefix']('notasCredito:');
          this.loadMaestro();
        },
        error: (err) => this.showError(this.extractError(err, 'Error al guardar la NC.'))
      });
  }

  private reloadNcLineasDesdeBackend(): Observable<NcLinea[]> {
    const raw = this.facForm.getRawValue();
    const codGen = String(raw.CodGeneracion ?? '').trim();
    const sucursal = String(raw.Sucursal ?? '').trim();
    const puntoVenta = String(raw.PuntoVenta ?? '').trim();
    const prefijo = codGen.substring(0, 18);
    const factura = codGen.substring(18, 36);
    if (!prefijo || !factura) {
      return of([]);
    }
    return this.facturacionService.getFacturaDetalle(prefijo, factura, sucursal, puntoVenta, 'NC').pipe(
      map((detalle) => (detalle ?? []).map((d) => this.ncLineaFromDetalle(d, true)))
    );
  }

  // Update_DetalleFactura_DescuentoPorValor no soporta UPDATE (TipoMtto<>'A' siempre borra).
  // Update_DetalleFactura sí soporta UPDATE, decidido por @LINEA (0=nueva, >0=existente) cuando TipoMtto='A'.
  // Por eso una línea ya persistida y sin cambios NUNCA debe reenviarse: repetirla generaba el detalle duplicado.
  private async saveAllLines(): Promise<void> {
    const lineas = this.ncLineas();
    const modo = this.ncModo();
    const raw = this.facForm.getRawValue();
    const username = this.authService.currentUser()?.username ?? '';
    const codGen = String(raw.CodGeneracion ?? '').trim();
    const sucursal = String(raw.Sucursal ?? '').trim();
    const puntoVenta = String(raw.PuntoVenta ?? '').trim();
    const totalSumas = this.sumasNc();
    const totalIva = this.ivaNc();

    for (const linea of lineas) {
      const isNewLine = linea.linea === 0;
      if (!isNewLine && !linea.isDirty) {
        continue;
      }

      const calidad = isNaN(parseInt(linea.calidad, 10)) ? '0' : linea.calidad;

      if (modo === 'DESCUENTO') {
        if (!isNewLine) {
          await this.deleteNcLineaObs(linea, codGen, sucursal, puntoVenta, username).toPromise();
        }
        const payload: UpdateDetalleFacturaDescuentoDto = {
          CodGeneracion: codGen,
          Sucursal: sucursal,
          PuntoVenta: puntoVenta,
          TipoFactura: 'NC',
          Cantidad: 1,
          Articulo: linea.articulo,
          Descripcion: linea.descripcion,
          PrecioUnitario: linea.montoDescuento,
          CostoUnitario: linea.montoDescuento,
          Calidad: calidad,
          Bodega: linea.bodega,
          UnidadMedida: linea.unidadMedida,
          Usuario: username,
          TipoMtto: 'A',
          Linea: 0,
          SubTotal: totalSumas,
          IVA: totalIva,
          Impuesto2: 0,
          Impuesto3: 0,
          Retencion: 0,
          TipoDescuento: 'V',
          Descuento: linea.montoDescuento,
          TipoColor: linea.tipoColor || 'NA',
          IdColor: linea.idColor,
          IdAcabado: linea.idAcabado
        };
        await this.facturacionService.updateDetalleFacturaDescuento(payload).toPromise();
      } else {
        const payload: UpdateDetalleFacturaDto = {
          CodGeneracion: codGen,
          Sucursal: sucursal,
          PuntoVenta: puntoVenta,
          TipoFactura: 'NC',
          Cantidad: linea.cantidadDevolucion,
          Articulo: linea.articulo,
          Descripcion: linea.descripcion,
          PrecioUnitario: linea.precioUnitario,
          CostoUnitario: linea.costoUnitario,
          Calidad: calidad,
          Bodega: linea.bodega,
          UnidadMedida: linea.unidadMedida,
          Usuario: username,
          TipoMtto: 'A',
          Linea: isNewLine ? 0 : linea.linea,
          SubTotal: totalSumas,
          IVA: totalIva,
          Impuesto2: 0,
          Impuesto3: 0,
          Retencion: 0,
          TipoColor: linea.tipoColor || 'NA',
          CantidadConversion: linea.cantidadDevolucion,
          UnidadMedidaConversion: linea.unidadMedida,
          IdColor: linea.idColor,
          IdAcabado: linea.idAcabado
        };
        await this.facturacionService.updateDetalleFactura(payload).toPromise();
      }
    }
  }

  private deleteNcLineaObs(
    linea: NcLinea,
    codGen: string,
    sucursal: string,
    puntoVenta: string,
    username: string
  ): Observable<unknown> {
    const calidad = isNaN(parseInt(linea.calidad, 10)) ? '0' : linea.calidad;
    const totalSumas = this.sumasNc();
    const totalIva = this.ivaNc();

    if (this.ncModo() === 'DESCUENTO') {
      const payload: UpdateDetalleFacturaDescuentoDto = {
        CodGeneracion: codGen,
        Sucursal: sucursal,
        PuntoVenta: puntoVenta,
        TipoFactura: 'NC',
        Cantidad: 1,
        Articulo: linea.articulo,
        Descripcion: linea.descripcion,
        PrecioUnitario: linea.montoDescuento,
        CostoUnitario: linea.montoDescuento,
        Calidad: calidad,
        Bodega: linea.bodega,
        UnidadMedida: linea.unidadMedida,
        Usuario: username,
        TipoMtto: 'B',
        Linea: linea.linea,
        SubTotal: totalSumas,
        IVA: totalIva,
        Impuesto2: 0,
        Impuesto3: 0,
        Retencion: 0,
        TipoDescuento: 'V',
        Descuento: linea.montoDescuento,
        TipoColor: linea.tipoColor || 'NA',
        IdColor: linea.idColor,
        IdAcabado: linea.idAcabado
      };
      return this.facturacionService.updateDetalleFacturaDescuento(payload);
    }

    const payload: UpdateDetalleFacturaDto = {
      CodGeneracion: codGen,
      Sucursal: sucursal,
      PuntoVenta: puntoVenta,
      TipoFactura: 'NC',
      Cantidad: linea.cantidadDevolucion,
      Articulo: linea.articulo,
      Descripcion: linea.descripcion,
      PrecioUnitario: linea.precioUnitario,
      CostoUnitario: linea.costoUnitario,
      Calidad: calidad,
      Bodega: linea.bodega,
      UnidadMedida: linea.unidadMedida,
      Usuario: username,
      TipoMtto: 'B',
      Linea: linea.linea,
      SubTotal: totalSumas,
      IVA: totalIva,
      Impuesto2: 0,
      Impuesto3: 0,
      Retencion: 0,
      TipoColor: linea.tipoColor || 'NA',
      CantidadConversion: linea.cantidadDevolucion,
      UnidadMedidaConversion: linea.unidadMedida,
      IdColor: linea.idColor,
      IdAcabado: linea.idAcabado
    };
    return this.facturacionService.updateDetalleFactura(payload);
  }

  // ── Apply / Desapply ───────────────────────────────────────────────────────
  aplicar() {
    if (!this.canApply()) return;
    const raw = this.facForm.getRawValue();
    const selected = this.selectedFactura();
    const formCod = String(raw.CodGeneracion ?? '').trim();
    const codGen = formCod.length >= 36 ? formCod : ((selected?.Prefijo ?? '') + (selected?.Factura ?? ''));
    const payload: UpdateFacturacionAplicacionDto = {
      CodGeneracion: codGen,
      Sucursal: String(raw.Sucursal ?? '').trim(),
      PuntoVenta: String(raw.PuntoVenta ?? '').trim(),
      TipoFactura: 'NC',
      Usuario: this.authService.currentUser()?.username ?? '',
      IdEmpresa: this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0,
      TipoMtto: 'Aplicar'
    };
    this.saving.set(true);
    this.facturacionService.updateFacturacionAplicacion(payload)
      .pipe(finalize(() => { this.saving.set(false); this.cdr.markForCheck(); }))
      .subscribe({
        next: () => {
          this.ncEstadoActual.set('APLICADO');
          this.isLocked.set(true);
          this.showInfo('NC aplicada correctamente.');
          this.facturacionService['invalidateCacheByPrefix']('notasCredito:');
        },
        error: (err) => this.showError(this.extractError(err, 'Error al aplicar la NC.'))
      });
  }

  desaplicar() {
    if (!this.canDesapply()) return;
    const raw = this.facForm.getRawValue();
    const selected = this.selectedFactura()!;
    const formCod = String(raw.CodGeneracion ?? '').trim();
    const codGen = formCod.length >= 36 ? formCod : (selected.Prefijo + selected.Factura);
    const payload: UpdateFacturacionAplicacionDto = {
      CodGeneracion: codGen,
      Sucursal: String(raw.Sucursal ?? '').trim(),
      PuntoVenta: String(raw.PuntoVenta ?? '').trim(),
      TipoFactura: 'NC',
      Usuario: this.authService.currentUser()?.username ?? '',
      IdEmpresa: this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0,
      TipoMtto: 'Desaplicar'
    };
    this.saving.set(true);
    this.facturacionService.updateFacturacionAplicacion(payload)
      .pipe(finalize(() => { this.saving.set(false); this.cdr.markForCheck(); }))
      .subscribe({
        next: () => { this.showInfo('NC desaplicada.'); this.closeDetail(); },
        error: (err) => this.showError(this.extractError(err, 'Error al desaplicar la NC.'))
      });
  }

  // ── Cancel (anulación) ────────────────────────────────────────────────────
  openAnulacionDialog() {
    if (!this.canAnular()) return;
    this.anulacionMotivo.set('');
    this.anulacionDialogVisible.set(true);
  }

  confirmarAnulacion() {
    const motivo = this.anulacionMotivo().trim();
    if (!motivo) { this.showError('Ingrese un motivo de anulación.'); return; }
    const raw = this.facForm.getRawValue();
    const payload: AnulacionFacturaDto = {
      codGeneracion: String(raw.CodGeneracion ?? '').trim(),
      Sucursal: String(raw.Sucursal ?? '').trim(),
      PuntoVenta: String(raw.PuntoVenta ?? '').trim(),
      TipoFactura: 'NC',
      ComentarioAnulacion: motivo,
      usuario: this.authService.currentUser()?.username ?? ''
    };
    this.anulandoDte.set(true);
    this.facturacionService.anularFactura(payload)
      .pipe(finalize(() => { this.anulandoDte.set(false); this.anulacionDialogVisible.set(false); this.cdr.markForCheck(); }))
      .subscribe({
        next: () => { this.showInfo('NC anulada.'); this.closeDetail(); },
        error: (err) => this.showError(this.extractError(err, 'Error al anular la NC.'))
      });
  }

  // ── Vista Previa ──────────────────────────────────────────────────────────
  canVistaPrevia(): boolean {
    const idFactura = this.toNumber(this.facForm.controls.IdFactura.value);
    return !!idFactura && this.ncEstado() !== 'ANULADO';
  }

  vistaPrevia() {
    if (this.previewLoading()) return;
    if (!this.canVistaPrevia()) {
      this.showError('No se permite vista previa para documentos anulados.');
      return;
    }
    const idFactura = this.toNumber(this.facForm.controls.IdFactura.value);
    const idEmpresa = this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0;
    if (!idFactura) { this.showError('Guarde la NC antes de abrir la vista previa.'); return; }
    if (!idEmpresa) { this.showError('No se encontró IdEmpresa en la sesión.'); return; }
    const emitido = !this.isSelloRecepcionEmpty(this.facForm.controls.SelloRecepcion.value);
    const previewUrl = this.facturacionService.getPreviewDteUrl(idEmpresa, idFactura, 'NC', emitido);
    this.previewLoading.set(true);
    const popup = window.open(previewUrl, '_blank', 'noopener,noreferrer');
    this.previewLoading.set(false);
    if (!popup) {
      this.showError('El navegador bloqueó la vista previa. Permita ventanas emergentes.');
    }
  }

  // ── DTE emission ──────────────────────────────────────────────────────────
  isSelloRecepcionEmpty(value: unknown): boolean {
    return !String(value ?? '').trim();
  }

  hasSelloRecepcion(): boolean {
    return !!String(this.facForm.controls.SelloRecepcion.value ?? '').trim();
  }

  cerrarEmisionPanel(): void {
    this.emisionPanelOpen.set(false);
  }

  canEmit(): boolean {
    return !this.emitting() &&
      this.ncEstado() === 'APLICADO' &&
      !this.hasSelloRecepcion() &&
      !!this.toNumber(this.facForm.controls.IdFactura.value);
  }

  emitirDte() {
    if (!this.canEmit()) {
      this.showError('Solo NC aplicadas sin sello de recepción permiten emitir DTE.');
      return;
    }
    const idFactura = this.toNumber(this.facForm.controls.IdFactura.value);
    const apiBaseUrl = this.authService.getEmissionApiBaseUrl();
    if (!apiBaseUrl) { this.showError('No se encontró UrlAPI en la sesión de empresa.'); return; }
    const idEmpresa = this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0;
    const username = this.authService.currentUser()?.username ?? '';
    const raw = this.facForm.getRawValue();
    const payload: ParametrosDteDto = {
      idFactura,
      idEmpresa,
      ambiente: this.getAmbiente(),
      codEstablecimiento: this.resolveCodigoSucursalMh(raw.Sucursal ?? '', raw.PuntoVenta ?? ''),
      codPuntoVenta: this.resolveCodigoPuntoMh(raw.Sucursal ?? '', raw.PuntoVenta ?? ''),
      user: username
    };
    this.openPanel();
    this.setStep('service', 'running', 'Verificando servicio de emisión');
    this.emitting.set(true);
    this.facturacionService
      .serviceAvailable(apiBaseUrl)
      .pipe(
        switchMap((status) => {
          if (String(status ?? '').trim().toLowerCase() !== 'online') {
            throw new Error('Servicio de emisión no disponible.');
          }
          this.setStep('service', 'ok', 'Servicio en línea');
          this.setStep('verify', 'running', 'Verificando estado del documento');
          return this.refreshNcAfterEmission().pipe(
            switchMap((encabezado) => {
              if ((encabezado.NoControl || '').trim() || (encabezado.SelloRecepcion || '').trim()) {
                this.setStep('verify', 'ok', 'Documento ya emitido');
                this.setStep('emit', 'ok', 'No se requiere nueva emisión');
                this.setStep('sync', 'ok', 'Datos recuperados');
                this.showInfo('La NC ya estaba emitida y se sincronizó.');
                return of(null as RespuestaDteDto | null);
              }
              this.setStep('verify', 'ok', 'Documento listo para emisión');
              this.setStep('emit', 'running', 'Enviando a Hacienda');
              return this.facturacionService.emitirDte(apiBaseUrl, payload, 'NC');
            })
          );
        }),
        switchMap((response) => {
          if (!response) return of(null as { emitido: boolean; html: string } | null);
          if (!String(response.SelloRecepcion ?? '').trim()) {
            throw new Error(String(response.MensajeGeneral ?? 'La emisión no devolvió sello de recepción.'));
          }
          this.setStep('emit', 'ok', 'NC emitida correctamente');
          this.setStep('sync', 'running', 'Recuperando sello y número de control');
          return this.refreshNcAfterEmission().pipe(
            switchMap(() => {
              this.setStep('sync', 'ok', 'Datos actualizados');
              this.setStep('correo', 'running', 'Enviando correo y formato visual');
              return this.facturacionService.enviarCorreoDte(idEmpresa, idFactura, 'NC').pipe(
                map((html) => ({ emitido: true, html: this.normalizeDteVisualHtml(html) })),
                catchError((err) => {
                  this.setStep('correo', 'error', this.extractError(err, 'No se pudo enviar correo.'));
                  return of({ emitido: true, html: '' });
                })
              );
            })
          );
        }),
        finalize(() => this.emitting.set(false))
      )
      .subscribe({
        next: (result) => {
          if (result?.emitido) {
            if (result.html) { this.openDteVisualPreview(result.html); }
            this.setStep('correo', 'ok', 'Correo enviado y vista previa abierta');
            this.showInfo('DTE emitido correctamente.');
          }
          this.loadMaestro();
        },
        error: (error) => {
          this.setStep('emit', 'error', this.extractError(error, 'Falló la emisión del DTE.'));
          this.showError(this.extractError(error, 'Falló la emisión del DTE.'));
        }
      });
  }

  private openPanel() {
    this.emisionPanelOpen.set(true);
    this.emisionSteps.set([
      { key: 'service', label: 'Verificando servicio', status: 'pending' },
      { key: 'verify', label: 'Validando documento', status: 'pending' },
      { key: 'emit', label: 'Emitiendo DTE', status: 'pending' },
      { key: 'sync', label: 'Sincronizando datos', status: 'pending' },
      { key: 'correo', label: 'Correo y formato visual', status: 'pending' }
    ]);
  }

  private setStep(key: string, status: EmisionStep['status'], detail?: string) {
    this.emisionSteps.update((steps) =>
      steps.map((s) => (s.key === key ? { ...s, status, detail } : s))
    );
  }

  private openDteVisualPreview(htmlCompleto: string) {
    const popup = window.open('', '_blank');
    if (!popup) {
      this.showError('El navegador bloqueó la vista visual del DTE.');
      return;
    }
    const toolbarHtml = `<div id="printToolbar" style="width:100%;text-align:center;padding:15px 0;background:#f8f9fa;border-bottom:1px solid #dee2e6;margin-bottom:20px;font-family:sans-serif;"><button onclick="window.print()" style="padding:12px 25px;background:#023c8d;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:bold;">Descargar / Imprimir PDF</button></div><style>@media print{#printToolbar{display:none!important}body{margin:0}}</style>`;
    const htmlFinal = htmlCompleto.includes('<body>')
      ? htmlCompleto.replace('<body>', `<body>${toolbarHtml}`)
      : `${toolbarHtml}${htmlCompleto}`;
    popup.document.open();
    popup.document.write(htmlFinal);
    popup.document.close();
  }

  private getAmbiente(): string {
    const raw = this.authService.currentUser()?.selectedEmpresa?.ambienteEmision;
    return Number(raw) === 0 ? '00' : '01';
  }

  private resolveCodigoSucursalMh(sucursal: string, puntoVenta: string): string {
    const row = this.sucursalPuntoRows().find((r) => r.Sucursal === sucursal && r.PUNTO_VENTA === puntoVenta);
    return row?.CodigoMHSC || sucursal || 'M001';
  }

  private resolveCodigoPuntoMh(sucursal: string, puntoVenta: string): string {
    const row = this.sucursalPuntoRows().find((r) => r.Sucursal === sucursal && r.PUNTO_VENTA === puntoVenta);
    return row?.codigoMHPV || puntoVenta || 'P001';
  }

  private refreshNcAfterEmission(): Observable<FacturaEncabezadoDto> {
    const selected = this.selectedFactura();
    const raw = this.facForm.getRawValue();
    const idEmpresa = this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0;
    let prefijo = selected?.Prefijo || '';
    let factura = selected?.Factura || '';
    if (!prefijo && !factura) {
      const codGen = String(raw.CodGeneracion ?? '').trim();
      if (codGen.length >= 36) {
        prefijo = codGen.substring(0, 18);
        factura = codGen.substring(18, 36);
      }
    }
    const sucursal = selected?.CODIGOSUCURSAL || selected?.SUCURSAL || raw.Sucursal || '';
    const punto = selected?.PUNTO_VENTA || raw.PuntoVenta || '';
    return this.facturacionService.getFacturaEncabezado(prefijo, factura, sucursal, punto, idEmpresa).pipe(
      map((enc) => { this.patchEncabezado(enc); return enc; })
    );
  }

  private normalizeDteVisualHtml(rawHtml: string): string {
    const text = String(rawHtml ?? '').trim();
    if (!text) return '';
    try { const p = JSON.parse(text); if (typeof p === 'string') return p; } catch { /* ignore */ }
    return text;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private buildHeaderPayload(): UpdateFacturaDto {
    const raw = this.facForm.getRawValue();
    const username = this.authService.currentUser()?.username ?? '';
    const isNew = !this.hasSavedCurrentRecord();
    const tipoMtto = isNew ? 'A' : 'C';

    return {
      CodGeneracion: String(raw.CodGeneracion ?? '').trim(),
      Sucursal: String(raw.Sucursal ?? '').trim(),
      PuntoVenta: String(raw.PuntoVenta ?? '').trim(),
      TipoVenta: 'G',
      Cliente: String(raw.Cliente ?? '').trim(),
      FacturarA: String(raw.FacturarA ?? '').trim(),
      Fecha: String(raw.Fecha ?? this.today()),
      CondicionPago: String(raw.CondicionPago ?? 'CONTADO').trim(),
      Vendedor: String(raw.Vendedor ?? username).trim() || username,
      Observaciones: String(raw.Observaciones ?? '').trim(),
      Usuario: username,
      TipoMtto: tipoMtto,
      Contabilizar: 0,
      SubTotal: this.sumasNc(),
      IVA: this.ivaNc(),
      Impuesto2: 0,
      Impuesto3: 0,
      Retencion: 0,
      NIT: String(raw.NIT ?? '').trim(),
      RegistroComercio: String(raw.RegistroComercio ?? '').trim(),
      NumeroResolucion: '',
      ExistenciaFecDoc: 0,
      NumeroControl: String(raw.NoControl ?? '').trim(),
      SelloRecepcion: String(raw.SelloRecepcion ?? '').trim(),
      JSON: '',
      IdCondicionTraslado: '',
      NombreEntrega: '',
      IdentificacionEntrega: '',
      NombreRecibe: '',
      IdentificacionRecibe: '',
      TipoDestinoRemision: '',
      Proveedor: '',
      IdModoTransporte: 0,
      NombreConductor: '',
      NumeroConductor: '',
      PlacaTransporte: '',
      IdRecintoFiscal: 0,
      IdIncoterm: 0,
      IdRegimenExportacion: 0,
      PrecioConIVA: 1,
      Flete: 0,
      Seguro: 0,
      DescuentoAdicional: 0,
      DTE: this.toNumber(raw.IdDTE),
      CorreoCliente: String(raw.CorreoElectronico ?? '').trim(),
      TipoFactura: 'NC'
    };
  }

  private patchEncabezado(enc: FacturaEncabezadoDto) {
    const codGeneracion = `${String(enc.Prefijo ?? '').trim()}${String(enc.Factura ?? '').trim()}` || enc.CodGeneracion;
    this.facForm.patchValue({
      CodGeneracion: codGeneracion,
      Cliente: enc.Cliente,
      FacturarA: enc.FacturarA,
      Fecha: String(enc.Fecha ?? '').substring(0, 10),
      CondicionPago: enc.CondicionPago,
      TipoVenta: enc.TipoVenta || 'G',
      Vendedor: enc.Vendedor,
      Observaciones: enc.Observaciones,
      Sucursal: enc.Sucursal,
      PuntoVenta: enc.PuntoVenta,
      NIT: enc.NIT,
      RegistroComercio: enc.RegistroComercio,
      Identificacion: enc.Identificacion,
      CorreoElectronico: enc.CorreoElectronico,
      IdFactura: enc.IdFactura,
      NoControl: enc.NoControl,
      SelloRecepcion: enc.SelloRecepcion,
      IdDTE: enc.IdDTE
    });
    this.selectedSucursal.set(enc.Sucursal);
  }

  private ncLineaFromDetalle(d: FacturaDetalleDto, fromExistingNc: boolean): NcLinea {
    const precioUnitario = this.toNumber(d.PRECIO_UNITARIO);
    const cantidad = this.toNumber(d.CANTIDAD);
    // PRECIO_UNITARIO is always the net (ex-IVA) price.
    // Net amount = net × qty; IVA = net amount × 13%; total = net amount × 1.13.
    const netAmount = this.roundAmount(precioUnitario * cantidad);
    const iva = this.roundAmount(netAmount * 0.13);
    const subtotal = netAmount;
    return {
      linea: fromExistingNc ? this.toNumber(d.LINEA) : 0,
      articulo: String(d.ARTICULO ?? '').trim(),
      descripcion: String(d.DESCRIPCION ?? '').trim(),
      calidad: String(d.CALIDAD ?? '').trim(),
      cantidad,
      precioUnitario,
      costoUnitario: this.toNumber(d.COSTO_UNITARIO),
      bodega: String(d.BODEGA ?? '').trim(),
      unidadMedida: String(d.UNIDAD_MEDIDA ?? '').trim(),
      tipoColor: String(d.TIPO_COLOR ?? 'NA').trim(),
      idColor: this.toNumber(d.ID_COLOR),
      idAcabado: String(d.IdAcabado ?? '').trim(),
      cantidadDevolucion: cantidad,
      montoDescuento: netAmount,
      maxDescuento: netAmount,
      subtotal,
      iva,
      impuesto2: 0,
      impuesto3: 0,
      isDirty: false
    };
  }

  private applyDefaultSucursalPunto() {
    const sucursales = this.sucursalOptions();
    if (!sucursales.length) return;
    const first = sucursales[0].value;
    this.selectedSucursal.set(first);
    this.facForm.patchValue({ Sucursal: first });
    const puntos = this.puntoVentaOptions();
    if (puntos.length) this.facForm.patchValue({ PuntoVenta: puntos[0].value });
  }

  onSucursalChange(value: string) {
    this.selectedSucursal.set(value);
    const puntos = this.puntoVentaOptions();
    if (puntos.length) this.facForm.patchValue({ PuntoVenta: puntos[0].value });
  }

  formatCurrency(value: unknown): string {
    return this.currencyFormatter.format(this.toNumber(value));
  }

  fmtFecha(value: unknown): string {
    const text = String(value ?? '').trim();
    if (!text) return '—';
    const m1 = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+.*)?$/);
    if (m1) {
      const hasMeridiem = /\b(?:AM|PM)\b/i.test(text);
      let day = Number(m1[1]), month = Number(m1[2]);
      if (hasMeridiem || month > 12) { month = day; day = Number(m1[2]); }
      return `${String(day).padStart(2,'0')}/${String(month).padStart(2,'0')}/${m1[3]}`;
    }
    const m2 = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+.*)?$/);
    if (m2) return `${m2[3]}/${m2[2]}/${m2[1]}`;
    const d = new Date(text.includes('T') ? text : text.replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return text;
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  }

  normalizeEstado(estado: string): string {
    return String(estado ?? '').trim().toUpperCase();
  }

  // Estandarizado con CCF: un documento "Aplicado" sin sello de recepción aún no fue
  // transmitido a Hacienda, por lo que se muestra como pendiente de emitir en vez de
  // dejar el estado congelado en "Aplicado" tras una emisión exitosa.
  estadoVisualKey(estado: unknown, selloRecepcion: unknown): 'ELABORACION' | 'PENDIENTE_EMITIR' | 'EMITIDO' | 'ANULADO' | 'OTRO' {
    const normalized = this.normalizeEstadoValue(estado);

    if (normalized === 'APLICADO') {
      return this.isSelloRecepcionEmpty(selloRecepcion) ? 'PENDIENTE_EMITIR' : 'EMITIDO';
    }

    if (normalized === 'ANULADO') {
      return 'ANULADO';
    }

    if (normalized === 'ELABORACION') {
      return 'ELABORACION';
    }

    return 'OTRO';
  }

  estadoVisualLabel(estado: unknown, selloRecepcion: unknown): string {
    const visual = this.estadoVisualKey(estado, selloRecepcion);

    if (visual === 'PENDIENTE_EMITIR') {
      return 'PENDIENTE DE EMITIR';
    }

    if (visual === 'EMITIDO') {
      return 'EMITIDO';
    }

    return visual;
  }

  private normalizeEstadoValue(value: unknown): 'ELABORACION' | 'APLICADO' | 'ANULADO' | 'OTRO' {
    const estado = String(value ?? '').trim().toUpperCase();

    if (!estado || estado === 'BORRADOR' || estado === 'ELABORACION' || estado === 'E') {
      return 'ELABORACION';
    }

    if (estado === 'APLICADA' || estado === 'APLICADO' || estado === 'A') {
      return 'APLICADO';
    }

    if (estado === 'ANULADA' || estado === 'ANULADO' || estado === 'N') {
      return 'ANULADO';
    }

    return 'OTRO';
  }

  private today(): string {
    return new Date().toISOString().substring(0, 10);
  }

  private todayMinus30(): string {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().substring(0, 10);
  }

  private roundAmount(v: number): number {
    return Math.round(v * 100) / 100;
  }

  private toNumber(v: unknown): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  private showInfo(msg: string) {
    this.messageService.add({ severity: 'info', summary: 'Nota de Crédito', detail: msg, life: 4000 });
  }

  private showError(msg: string) {
    this.messageService.add({ severity: 'error', summary: 'Error', detail: msg, life: 6000 });
  }

  private extractError(err: unknown, fallback: string): string {
    if (typeof err === 'string') return err;
    if (err instanceof Error) return err.message;
    return fallback;
  }

}
