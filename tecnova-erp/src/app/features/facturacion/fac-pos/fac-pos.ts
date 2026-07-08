import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, PLATFORM_ID, ViewChild, computed, inject, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Observable, catchError, finalize, forkJoin, from, map, of, switchMap } from 'rxjs';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { InputTextModule } from 'primeng/inputtext';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ToastModule } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { MessageService } from 'primeng/api';

import { AuthService } from '../../../core/services/auth';
import {
  AnulacionFacturaDto,
  ArticuloPorBodegaDto,
  InfoVentaArticuloDto,
  DatosDestinatarioDteDto,
  EmisionStep,
  FacturaDetalleDto,
  FacturaEncabezadoDto,
  FacturaFormaPagoDto,
  FacturaGeneralDto,
  FacturaRetencionDto,
  FacturaTotalesDto,
  FormaPagoDto,
  PerfilClienteDto,
  ParametrosDteDto,
  ParametrosDteAnulacionDto,
  CondicionPagoCatalogoDto,
  DeleteFacturaDto,
  RetencionCatalogoDto,
  SucursalPuntoVendedorDto,
  UpdateCambioTipoFacturaDto,
  UpdateDetalleFacturaDto,
  UpdateFacturaFormaPagoDto,
  UpdateFacturacionAplicacionDto,
  UpdateFacturaDto,
  UpdateFacturaRetencionDto,
  VerificarSecuenciasDto
} from '../../../core/models/facturacion.models';
import { environment } from '../../../../environments/environment';
import { getTipoFacturaDescripcion } from '../../../shared/utils/tipo-factura';
import { FacturacionService } from '../services/facturacion';
import { ReciboService, ReciboDatos } from '../services/recibo';
import { ArticulosService } from '../../articulos/services/articulos';
import { ReenviarCorreoDialogComponent } from '../../../shared/components/reenviar-correo-dialog/reenviar-correo-dialog';
import { EliminarConfirmDialogComponent } from '../../../shared/components/eliminar-confirm-dialog/eliminar-confirm-dialog';

interface BarcodeDetectorResultLike {
  rawValue?: string;
}

interface BarcodeDetectorLike {
  detect: (source: ImageBitmapSource) => Promise<BarcodeDetectorResultLike[]>;
}

type BarcodeDetectorCtorLike = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

@Component({
  selector: 'app-fac-pos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    CardModule,
    AutoCompleteModule,
    InputTextModule,
    ProgressSpinnerModule,
    ToastModule,
    DialogModule,
    ReenviarCorreoDialogComponent,
    EliminarConfirmDialogComponent
  ],
  providers: [MessageService],
  templateUrl: './fac-pos.html',
  styleUrls: ['./fac-pos.scss']
})
export class FacPosComponent implements OnDestroy {
  @ViewChild(ReenviarCorreoDialogComponent) reenviarCorreoDialog!: ReenviarCorreoDialogComponent;
  @ViewChild(EliminarConfirmDialogComponent) eliminarConfirmDialog!: EliminarConfirmDialogComponent;

  private readonly simulateLargeCatalogForTest = false;
  private readonly simulatedCatalogTarget = 600;
  private readonly articuloChunkSize = 80;

  private fb = inject(FormBuilder);
  private platformId = inject(PLATFORM_ID);
  private cdr = inject(ChangeDetectorRef);
  private authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  private facturacionService = inject(FacturacionService);
  private reciboService = inject(ReciboService);
  private articulosService = inject(ArticulosService);
  private messageService = inject(MessageService);
  private currencyFormatter = new Intl.NumberFormat('es-SV', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  loadingList = signal(false);
  loadingDetail = signal(false);
  loadingTotals = signal(false);
  previewLoading = signal(false);
  saving = signal(false);
  showDetail = signal(false);
  confirmClienteDialogVisible = signal(false);
  clienteDataDialogVisible = signal(false);
  adminInfoDialogVisible = signal(false);
  isLocked = signal(false);
  emitting = signal(false);
  hasSavedCurrentRecord = signal(false);
  showCobroSection = signal(false);
  cobroDialogVisible = signal(false);
  anulacionDialogVisible = signal(false);
  confirmAnulacionDialogVisible = signal(false);
  anulacionMotivo = signal('');
  anulandoDte = signal(false);
  tipoFacturaMenu = signal<'FAC' | 'CCF'>('FAC');
  tipoFacturaActual = signal<'FAC' | 'CCF'>('FAC');
  private facturaTotalesRequestInFlightForId: number | null = null;

  facturas = signal<FacturaGeneralDto[]>([]);
  detalleRows = signal<FacturaDetalleDto[]>([]);
  sucursalPuntoRows = signal<SucursalPuntoVendedorDto[]>([]);
  selectedFactura = signal<FacturaGeneralDto | null>(null);

  emisionPanelOpen = signal(false);
  emisionSteps = signal<EmisionStep[]>([]);

  desde = signal(this.formatDateInput(this.startOfMonth(new Date())));
  hasta = signal(this.formatDateInput(new Date()));

  filterText = signal('');
  selectedSucursal = signal('');
  perfilClientes = signal<PerfilClienteDto[]>([]);
  clientesOptions = signal<string[]>([]);
  clienteSuggestions = signal<string[]>([]);
  articulosOptions = signal<ArticuloPorBodegaDto[]>([]);
  articuloSuggestions = signal<string[]>([]);
  // Existencia en línea del artículo seleccionado (null = aún no consultada).
  articuloExistencia = signal<number | null>(null);
  articuloSinExistencia = computed(() => {
    const e = this.articuloExistencia();
    return e !== null && e <= 0;
  });
  articuloCardSearch = signal('');
  articleViewMode = signal<'listado' | 'imagenes'>('listado');
  articuloVisibleLimit = signal(this.articuloChunkSize);
  articuloImagenUrls = signal<Record<string, string>>({});
  articuloImagenDialogVisible = signal(false);
  scannerDialogVisible = signal(false);
  scannerBusy = signal(false);
  scannerStatusMessage = signal('Apunta la cámara al código de barras o QR del artículo.');
  selectedArticuloImagen = signal<ArticuloPorBodegaDto | null>(null);
  private articuloImagenLoading = new Set<string>();
  private scannerVideoStream: MediaStream | null = null;
  private scannerRafId: number | null = null;
  private scannerLastTickAt = 0;
  private scannerDetector: BarcodeDetectorLike | null = null;
  private readonly scanAllowedFormats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'codabar', 'qr_code'];
  formasPagoOptions = signal<FormaPagoDto[]>([]);
  retencionesOptions = signal<RetencionCatalogoDto[]>([]);
  condicionesPagoOptions = signal<CondicionPagoCatalogoDto[]>([]);
  retencionAplicada = signal<{ codigo: string; descripcion: string; monto: number } | null>(null);
  formasPagoDetalle = signal<Array<{ codigo: string; descripcion: string; monto: number }>>([]);
  totalFormasPago = computed(() => this.formasPagoDetalle().reduce((acc, item) => acc + this.toNumber(item.monto), 0));
  saldoPendienteCobro = computed(() => Number((this.toNumber(this.facForm.controls.TotalFactura.value) - this.totalFormasPago()).toFixed(2)));
  isNewUnsaved = computed(() => !this.hasSavedCurrentRecord() && !this.selectedFactura());
  isAnonimoClient = signal(false);
  emiteDte = signal(false);
  cambioTipoFacturaLabel = computed(() =>
    this.getCurrentTipoFactura() === 'FAC'
      ? 'Cambiar a Crédito Fiscal'
      : 'Cambiar a consumidor final'
  );
  // Excepción ambiente de pruebas (00): empresas que SÍ emiten DTE pero están en el ambiente de
  // Hacienda de pruebas registran la venta con un recibo local, sin contactar a Hacienda.
  // Solo aplica a FAC (Consumidor Final); CCF sigue el flujo real de emisión aunque ambiente sea 0.
  // En ambiente 1 esta bandera siempre es false y todo el comportamiento existente queda intacto.
  esAmbientePrueba = computed(() => this.getAmbiente() === '00');
  esRegistroSinDte = computed(() => this.emiteDte() && this.esAmbientePrueba() && this.getCurrentTipoFactura() === 'FAC');

  confirmarCobroLabel = computed(() =>{
    if (!this.emiteDte()) {
    return 'Finalizar factura';
  }
    if (this.esRegistroSinDte()) {
      return 'Registrar factura';
    }
   return this.getCurrentTipoFactura() === 'CCF'
      ? 'Emitir Crédito Fiscal'
      : 'Emitir Consumidor Final'
});

  sucursalOptions = computed(() => {
    const unique = new Map<string, { value: string; label: string }>();
    for (const row of this.sucursalPuntoRows()) {
      const value = String(row.Sucursal ?? '').trim();
      if (!value || unique.has(value)) continue;
      unique.set(value, { value, label: String(row.NombreSC || row.Sucursal || '').trim() });
    }
    return Array.from(unique.values()).sort((a, b) => a.label.localeCompare(b.label));
  });

  puntoVentaOptions = computed(() => {
    const sucursal = this.selectedSucursal().trim();
    if (!sucursal) return [] as Array<{ value: string; label: string }>;

    const unique = new Map<string, { value: string; label: string }>();
    for (const row of this.sucursalPuntoRows()) {
      if (String(row.Sucursal ?? '').trim() !== sucursal) continue;
      const value = String(row.PUNTO_VENTA ?? '').trim();
      if (!value || unique.has(value)) continue;
      unique.set(value, { value, label: String(row.NombrePV || row.PUNTO_VENTA || '').trim() });
    }
    return Array.from(unique.values()).sort((a, b) => a.label.localeCompare(b.label));
  });

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

  visibleArticuloCards = computed(() => {
    const limit = this.articuloVisibleLimit();
    return this.filteredArticuloCards().slice(0, limit);
  });

  articuloCardsRemaining = computed(() => {
    const remaining = this.filteredArticuloCards().length - this.articuloVisibleLimit();
    return remaining > 0 ? remaining : 0;
  });

  facForm = this.fb.group({
    IdFactura: this.fb.control(0, { nonNullable: true }),
    Estado: ['BORRADOR'],
    Fecha: [this.formatDateInput(new Date()), [Validators.required]],
    Sucursal: ['', [Validators.required]],
    PuntoVenta: ['', [Validators.required]],
    Cliente: ['', [Validators.required]],
    FacturarA: ['', [Validators.required]],
    NombreFacturarA: [''],
    Nombre: [''],
    NIT: [''],
    Identificacion: [''],
    RegistroComercio: [''],
    Giro: [''],
    CorreoElectronico: [''],
    Pais: [''],
    Departamento: [''],
    Municipio: [''],
    Direccion: [''],
    IncluyeIVA: this.fb.control(true, { nonNullable: true }),
    RetencionIvaCodigo: [''],
    IvaRetenido: this.fb.control(0, { nonNullable: true }),
    CondicionPago: ['CONTADO'],
    Vendedor: ['OFICINA'],
    FormaPagoCodigo: [''],
    FormaPagoMonto: this.fb.control(0, { nonNullable: true }),
    Observaciones: [''],
    LineaArticuloDisplay: [''],
    LineaArticulo: [''],
    LineaDescripcion: [''],
    LineaCantidad: this.fb.control(1, { nonNullable: true }),
    LineaPrecio: this.fb.control(0, { nonNullable: true }),
    LineaPrecioMayoreo: this.fb.control(0, { nonNullable: true }),
      LineaCantidadMinimaMayoreo: this.fb.control(0, { nonNullable: true }),
    Sumas: this.fb.control(0, { nonNullable: true }),
    Descuentos: this.fb.control(0, { nonNullable: true }),
    TotalOperacion: this.fb.control(0, { nonNullable: true }),
    TotalFactura: this.fb.control(0, { nonNullable: true }),
    SubTotalVentas: this.fb.control(0, { nonNullable: true }),
    TotalImpuesto1: this.fb.control(0, { nonNullable: true }),
    CodGeneracion: [''],
    NoControl: [''],
    SelloRecepcion: [''],
    IdDTE: this.fb.control(0, { nonNullable: true })
  });

  articuloImagenForm = this.fb.group({
    cantidad: this.fb.control(1, { nonNullable: true }),
    precio: this.fb.control(0, { nonNullable: true }),
    preciomayoreo: this.fb.control(0, { nonNullable: true }),
  });

  filteredFacturas = computed(() => {
    const term = this.filterText().trim().toLowerCase();
    if (!term) return this.facturas();
    return this.facturas().filter((item) =>
      [item.Factura, item.Prefijo, item.CLIENTE, item.FACTURAR_A, item.CodGeneracion, item.NoControl]
        .join(' ').toLowerCase().includes(term)
    );
  });

  facJsonPreview = computed(() => {
    const raw = this.facForm.getRawValue();
    const detalle = this.detalleRows();
    return {
      identificacion: {
        version: 1, ambiente: this.getAmbiente(), tipoDte: '01',
        numeroControl: raw.NoControl || null, codigoGeneracion: raw.CodGeneracion || null,
        tipoModelo: 1, tipoOperacion: 1, tipoContingencia: null, motivoContin: null,
        fecEmi: this.ensureDate(raw.Fecha), horEmi: this.currentTime(), tipoMoneda: 'USD'
      },
      documentoRelacionado: null,
      emisor: {
        nit: this.authService.currentUser()?.selectedEmpresa?.nit ?? null,
        nrc: this.authService.currentUser()?.selectedEmpresa?.nrc ?? null,
        nombre: this.authService.currentUser()?.selectedEmpresa?.nombreComercial ?? null,
        codActividad: null, descActividad: null,
        nombreComercial: this.authService.currentUser()?.selectedEmpresa?.nombreComercial ?? null,
        tipoEstablecimiento: '02',
        direccion: { departamento: null, municipio: null, complemento: null },
        telefono: null, correo: null,
        codEstableMH: this.resolveCodigoSucursalMh(raw.Sucursal ?? '', raw.PuntoVenta ?? ''),
        codEstable: raw.Sucursal ?? '',
        codPuntoVentaMH: this.resolveCodigoPuntoMh(raw.Sucursal ?? '', raw.PuntoVenta ?? ''),
        codPuntoVenta: raw.PuntoVenta ?? ''
      },
      receptor: {
        tipoDocumento: null, numDocumento: raw.Identificacion || null, nrc: null,
        nombre: raw.FacturarA || raw.Nombre || 'Sr(a)',
        codActividad: null, descActividad: null,
        direccion: { departamento: null, municipio: null, complemento: raw.Direccion || null },
        telefono: null, correo: raw.CorreoElectronico || null
      },
      otrosDocumentos: null, ventaTercero: null,
      cuerpoDocumento: detalle.map((item, index) => ({
        numItem: index + 1, tipoItem: 1, numeroDocumento: null,
        cantidad: this.toNumber(item.CANTIDAD), codigo: item.ARTICULO, codTributo: null,
        uniMedida: this.resolveUnidad(item.UNIDAD_MEDIDA), descripcion: item.DESCRIPCION,
        precioUni: this.toNumber(item.PRECIO_UNITARIO), montoDescu: this.toNumber(item.Descuento),
        ventaNoSuj: 0, ventaExenta: 0,
        ventaGravada: this.toNumber(item.TotalVenta || item.TOTAL), tributos: null,
        psv: this.toNumber(item.TotalVenta || item.TOTAL), noGravado: 0,
        ivaItem: this.calcIvaItem(item)
      })),
      resumen: {
        totalNoSuj: 0, totalExenta: 0, totalGravada: this.toNumber(raw.Sumas),
        subTotalVentas: this.toNumber(raw.TotalOperacion),
        descuNoSuj: 0, descuExenta: 0, descuGravada: 0, porcentajeDescuento: 0, totalDescu: this.toNumber(raw.Descuentos),
        tributos: null, subTotal: this.toNumber(raw.TotalOperacion), ivaRete1: 0, reteRenta: 0,
        montoTotalOperacion: this.toNumber(raw.SubTotalVentas), totalNoGravado: 0,
        totalPagar: this.toNumber(raw.TotalFactura),
        totalLetras: this.numberToSimpleWords(this.toNumber(raw.TotalFactura)),
        totalIva: this.toNumber(raw.TotalImpuesto1), saldoFavor: 0, condicionOperacion: 1,
        pagos: null, numPagoElectronico: null
      },
      extension: null, apendice: null
    };
  });

  constructor() {
    const tipoFacturaDesdeRuta = this.normalizeTipoFactura(this.route.snapshot.queryParamMap.get('tipoFactura'));
    this.tipoFacturaMenu.set(tipoFacturaDesdeRuta);
    this.tipoFacturaActual.set(tipoFacturaDesdeRuta);

    this.blockEmissionFields();
    this.loadInitial();

    this.route.queryParamMap.subscribe((params) => {
      const tipoFactura = this.normalizeTipoFactura(params.get('tipoFactura'));
      if (tipoFactura === this.tipoFacturaMenu()) {
        return;
      }

      this.tipoFacturaMenu.set(tipoFactura);
      this.tipoFacturaActual.set(tipoFactura);
      this.loadMaestro();
      this.openCreate();
    });
    const idEmpresa = this.authService.currentUser()?.selectedEmpresa?.idEmpresa;
    if (idEmpresa) {
        this.facturacionService.getEmiteDte(idEmpresa).subscribe(status => {
            this.emiteDte.set(status); // 'emiteDte' es tu Signal<boolean>
        });
    }
  }

  onFilterChange(value: string) { this.filterText.set(value); }

  onRangeChange(field: 'desde' | 'hasta', value: string, eventTarget?: EventTarget | null) {
    const normalized = this.normalizeFilterDate(value);
    const input = eventTarget as HTMLInputElement | null;
    const previousValue = field === 'desde' ? this.desde() : this.hasta();

    if (!normalized) {
      if (input) {
        input.value = previousValue;
      }
      return;
    }

    if (field === 'desde') {
      this.desde.set(normalized);
    } else {
      this.hasta.set(normalized);
    }

    if (input) {
      input.value = normalized;
    }

    const desde = String(this.desde() ?? '').trim();
    const hasta = String(this.hasta() ?? '').trim();
    if (!this.isValidFilterDate(desde) || !this.isValidFilterDate(hasta)) {
      return;
    }

    this.loadMaestro();
  }

  onSucursalChange(value: string) {
    const sucursal = String(value ?? '').trim();
    this.selectedSucursal.set(sucursal);
    this.facForm.patchValue({ Sucursal: sucursal });
    const currentPunto = String(this.facForm.controls.PuntoVenta.value ?? '').trim();
    if (!this.puntoVentaOptions().some((o) => o.value === currentPunto)) {
      this.facForm.patchValue({ PuntoVenta: '' });
    }
    this.syncDisabledControls();
  }

  loadMaestro() {
    this.loadingList.set(true);

    if (!this.isValidFilterDate(this.desde()) || !this.isValidFilterDate(this.hasta())) {
      this.loadingList.set(false);
      return;
    }

    this.facturacionService
      .getFacturasGeneral(this.desde(), this.hasta())
      .pipe(finalize(() => this.loadingList.set(false)))
      .subscribe({
        next: (rows) => {
          this.facturas.set((rows ?? []).filter((item) => {
            const tipoFactura = String(item.Tipo_Factura ?? '').trim().toUpperCase();
            return tipoFactura === this.tipoFacturaMenu();
          }));
        },
        error: (error) => {
          this.showError('FAC POS', this.extractError(error, 'No se pudo cargar el listado.'));
        }
      });
  }

  openCreate() {
    this.showDetail.set(true);
    this.selectedFactura.set(null);
    this.detalleRows.set([]);
    this.isLocked.set(false);
    this.formasPagoDetalle.set([]);
    this.hasSavedCurrentRecord.set(false);
    this.facForm.reset({
      IdFactura: 0, Estado: 'BORRADOR', Fecha: this.formatDateInput(new Date()),
      Sucursal: '', PuntoVenta: '', Cliente: '', FacturarA: '', Nombre: '',
      NombreFacturarA: '',
      NIT: '', Identificacion: '', RegistroComercio: '', Giro: '', CorreoElectronico: '',
      Pais: '', Departamento: '', Municipio: '', Direccion: '', IncluyeIVA: true,
      RetencionIvaCodigo: '', IvaRetenido: 0, CondicionPago: 'CONTADO', Vendedor: 'OFICINA',
      FormaPagoCodigo: '', FormaPagoMonto: 0, Observaciones: '',
      LineaArticulo: '', LineaDescripcion: '', LineaCantidad: 1, LineaPrecio: 0,LineaPrecioMayoreo: 0, LineaCantidadMinimaMayoreo: 0,
      Sumas: 0,
      Descuentos: 0,
      TotalOperacion: 0,
      TotalFactura: 0, SubTotalVentas: 0, TotalImpuesto1: 0,
      CodGeneracion: this.generateCodigoGeneracion(), NoControl: '', SelloRecepcion: '', IdDTE: 0
    });
    this.blockEmissionFields();
    this.selectedSucursal.set('');
    this.applyDefaultSucursalPunto();
    this.applyDefaultFormaPago();
    this.syncTotalsFromDetalle();
    this.retencionAplicada.set(null);
    this.isAnonimoClient.set(false);
    this.clienteDataDialogVisible.set(false);
    this.adminInfoDialogVisible.set(false);
    this.showCobroSection.set(false);
    this.cobroDialogVisible.set(false);
    this.tipoFacturaActual.set(this.tipoFacturaMenu());
    this.syncDisabledControls();
  }

  openEdit(item: FacturaGeneralDto) {
    const idEmpresa = this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0;
    const sucursal = String(item.CODIGOSUCURSAL || item.SUCURSAL || '').trim();
    const puntoVenta = String(item.PUNTO_VENTA || '').trim();
    this.showDetail.set(true);
    this.loadingDetail.set(true);
    this.selectedFactura.set(item);
    this.tipoFacturaActual.set(this.normalizeTipoFactura(item.Tipo_Factura));
    this.showCobroSection.set(false);
    this.hasSavedCurrentRecord.set(true);
    forkJoin({
      encabezado: this.facturacionService.getFacturaEncabezado(item.Prefijo, item.Factura, sucursal, puntoVenta, idEmpresa),
      detalle: this.facturacionService.getFacturaDetalle(item.Prefijo, item.Factura, sucursal, puntoVenta, item.Tipo_Factura)
    })
      .pipe(finalize(() => this.loadingDetail.set(false)))
      .subscribe({
        next: ({ encabezado, detalle }) => {
          this.patchEncabezado(encabezado);
          this.detalleRows.set(detalle ?? []);
          this.loadFacturaFormaPago(encabezado.IdFactura);
          this.loadFacturaRetenciones(
            encabezado.Cliente,
            item.Prefijo,
            item.Factura,
            sucursal,
            puntoVenta,
            'IVA',
            this.toNumber(encabezado.Retencion)
          );
          this.syncTotalsFromDetalle();
          this.isLocked.set(this.normalizeEstadoValue(encabezado.Estado) !== 'ELABORACION');
          this.syncDisabledControls();
        },
        error: (error) => {
          this.showError('FAC POS', this.extractError(error, 'No se pudo cargar la factura.'));
        }
      });
  }

  closeDetail() {
    this.showDetail.set(false);
    this.showCobroSection.set(false);
    this.cobroDialogVisible.set(false);
    this.adminInfoDialogVisible.set(false);
    this.emisionPanelOpen.set(false);
    this.loadMaestro();
  }

  cerrarEmisionPanel(): void {
    this.emisionPanelOpen.set(false);
  }

  ingresarOtraFactura(): void {
    this.emisionPanelOpen.set(false);
    this.openCreate();
  }

  registrarPago(item: FacturaGeneralDto): void {
    const idFactura = this.toNumber(item.iddoc);
    const monto = this.toNumber(item.TOTAL);
    const usuario = String(this.authService.currentUser()?.username ?? '').trim();
    this.facturacionService.updatePagoRecibido(idFactura, monto, usuario).subscribe({
      next: () => {
        this.loadMaestro();
      },
      error: (error) => {
        this.showError('FAC POS', this.extractError(error, 'No se pudo registrar el pago.'));
      }
    });
  }

  onReenviarCorreo(item: FacturaGeneralDto): void {
    const idEmpresa = this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0;
    const idFactura = this.toNumber(item.iddoc);
    const tipoFactura = String(item.Tipo_Factura ?? 'FAC').trim().toUpperCase() || 'FAC';
    const perfil = this.perfilClientes().find((c) => String(c.CLIENTE ?? '').trim() === String(item.CLIENTE ?? '').trim());
    const correoDefault = String(perfil?.CORREO_ELECTRONICO ?? '').trim();

    if (this.esDocumentoSinDte(item)) {
      this.reenviarCorreoDialog.abrir(idEmpresa, idFactura, tipoFactura, correoDefault, (correoDestino) =>
        this.enviarReciboDesdeListado(item, correoDestino)
      );
      return;
    }

    this.reenviarCorreoDialog.abrir(idEmpresa, idFactura, tipoFactura, correoDefault);
  }

  guardar() {
    if (!this.canSave()) {
      this.showError('FAC POS', 'Solo facturas en elaboración permiten guardar.');
      return;
    }
    if (this.requiresClienteConfirmation()) {
      this.confirmClienteDialogVisible.set(true);
      return;
    }

    this.executeGuardar();
  }

  confirmarGuardarConSrA() {
    this.applyDefaultSrCliente();
    this.confirmClienteDialogVisible.set(false);
    this.executeGuardar();
  }

  cancelarGuardarSinCliente() {
    this.confirmClienteDialogVisible.set(false);
    this.facForm.patchValue({ FacturarA: '', Cliente: '' });
    this.clienteSuggestions.set([...this.clientesOptions()]);
    this.showInfo('FAC POS', 'Seleccione un cliente de la lista para continuar.');
  }

  abrirDatosClienteDialog() {
    const condicion = String(this.facForm.controls.CondicionPago.value ?? '').trim();
    if (!condicion) {
      this.facForm.patchValue({ CondicionPago: 'CONTADO' });
    }
    this.clienteDataDialogVisible.set(true);
  }

  cerrarDatosClienteDialog() {
    this.clienteDataDialogVisible.set(false);
  }

  abrirMasInformacionDialog() {
    this.syncClienteSuggestions();
    this.adminInfoDialogVisible.set(true);
  }

  cerrarMasInformacionDialog() {
    this.adminInfoDialogVisible.set(false);
  }

  private executeGuardar() {

    const cliente = String(this.facForm.controls.FacturarA.value ?? '').trim()
      || String(this.facForm.controls.Cliente.value ?? '').trim();
    if (!cliente) {
      this.showError('FAC POS', 'Debe seleccionar un cliente.');
      return;
    }
    const payload = this.buildUpdateFacturaPayload();
    this.saving.set(true);
    this.facturacionService.updateFactura(payload)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (response) => {
          this.patchIdFacturaFromUpdateResponse(response);
          const idFactura = this.toNumber(this.facForm.controls.IdFactura.value);
          if (idFactura > 0) {
            this.loadFacturaFormaPago(idFactura);
          }
          this.hasSavedCurrentRecord.set(true);
          this.syncDisabledControls();
          this.showInfo('FAC POS', 'Factura guardada correctamente.');
          this.loadMaestro();
        },
        error: (error) => {
          this.showError('FAC POS', this.extractError(error, 'No se pudo guardar la factura.'));
        }
      });
  }

  aplicar() {
    if (!this.canApply()) { this.showError('FAC POS', 'Solo facturas en elaboración permiten aplicar.'); return; }
    const idFactura = this.facForm.controls.IdFactura.value;
    if (!idFactura) { this.showError('FAC POS', 'Guarde la factura antes de aplicar.'); return; }

    const payload = this.buildFacturacionAplicacionPayload('Aplicar');

    this.facturacionService.updateFacturacionAplicacion(payload).subscribe({
      next: () => {
        this.applyDefaultFormaPago();
        this.cobroDialogVisible.set(true);
        this.syncDisabledControls();
      },
      error: (error) => {
        this.showError('FAC POS', this.extractError(error, 'No se pudo validar existencia de productos para aplicar.'));
      }
    });
  }

  cancelarCobro() {
    this.executeDesaplicarFromCobro().subscribe({
      next: () => { this.cobroDialogVisible.set(false); },
      error: (error) => {
        this.showError('FAC POS', this.extractError(error, 'No se pudo desaplicar.'));
        this.cobroDialogVisible.set(false);
      }
    });
  }

  confirmarCobro() {
    if (!this.formasPagoDetalle().length) {
      this.showError('FAC POS', 'Debe registrar al menos una forma de cobro antes de continuar.');
      return;
    }
    if (this.saldoPendienteCobro() > 0.009) {
      this.showError('FAC POS', `Cobro incompleto. Pendiente: ${this.formatCurrency(this.saldoPendienteCobro())}.`);
      return;
    }
    this.cobroDialogVisible.set(false);
    this.isLocked.set(true);
    this.showCobroSection.set(false);
    this.facForm.patchValue({ Estado: 'APLICADO' });
    this.syncDisabledControls();
    if (this.esRegistroSinDte()) {
      this.registrarFacturaSinDte();
    } else if(this.emiteDte()){
 this.showInfo('FAC POS', 'Factura aplicada. Iniciando emisión DTE...');
    this.emitirDte();
    }else {
      // Flujo informal: Mostrar info y abrir ticket
      this.showInfo('FAC POS', 'Factura guardada correctamente.');
      this.imprimirTicketInformal();
      this.loadMaestro(); // Recargar el listado
    }

  }

  // Ambiente de pruebas: se salta el contacto con Hacienda. El recibo se muestra de inmediato
  // y el correo se envía en segundo plano (si falla se avisa; si no, se asume enviado).
  private registrarFacturaSinDte() {
    const idFactura = this.toNumber(this.facForm.controls.IdFactura.value);
    if (!idFactura) {
      this.showError('FAC POS', 'Guarde la factura antes de continuar.');
      return;
    }
    const idEmpresa = this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0;
    const datos = this.buildReciboDatosDesdeForm();
    const correoDestino = String(this.facForm.controls.CorreoElectronico.value ?? '').trim();

    // 1. Recibo al instante + UI liberada + listado actualizado. No esperamos al PDF ni al correo.
    this.emitting.set(false);
    this.syncDisabledControls();
    this.openDteVisualPreview(this.reciboService.buildDocumentoVisual(datos));
    this.showInfo('FAC POS', 'Factura registrada correctamente.');
    this.loadMaestro();

    // 2. Envío del recibo por correo en segundo plano.
    if (!correoDestino) {
      this.showInfo('FAC POS', 'El cliente no tiene correo registrado; el recibo no se envió.');
      return;
    }
    this.enviarReciboEnSegundoPlano(idEmpresa, idFactura, datos, correoDestino);
  }

  // El rasterizado (html2canvas) congela el hilo principal; con el defer el recibo ya está
  // pintado antes de empezar, y el envío SMTP es async y no bloquea.
  private enviarReciboEnSegundoPlano(idEmpresa: number, idFactura: number, datos: ReciboDatos, correoDestino: string): void {
    setTimeout(() => {
      this.reciboService.generarReciboPdfBase64(datos)
        .then((pdfBase64) => {
          this.facturacionService
            .enviarReciboDirecto(idEmpresa, idFactura, 'FAC', correoDestino, pdfBase64, `Recibo_${idFactura}.pdf`)
            .subscribe({
              next: () => this.showInfo('FAC POS', 'Recibo enviado por correo.'),
              error: (err) => this.showError('FAC POS', this.extractError(err, 'No se pudo enviar el recibo por correo.'))
            });
        })
        .catch(() => this.showError('FAC POS', 'No se pudo generar el PDF del recibo para el envío.'));
    }, 50);
  }

  private buildReciboDatosDesdeForm(): ReciboDatos {
    return this.buildReciboDatos(this.facForm.getRawValue(), this.detalleRows(), this.isAnonimoClient());
  }

  private buildReciboDatos(raw: Record<string, unknown>, detalles: FacturaDetalleDto[], anonimo: boolean): ReciboDatos {
    const empresa = this.authService.currentUser()?.selectedEmpresa;
    const logoSrc = empresa?.logo ? (empresa.logo.startsWith('http') ? empresa.logo : `data:image/png;base64,${empresa.logo}`) : '';
    const nombreEmpresa = empresa?.nombreComercial || empresa?.nombre || 'EMPRESA';
    const codigoDocumento = String(raw['CodGeneracion'] ?? '').trim() || '---';
    const fechaEmision = this.formatDateDisplay(raw['Fecha']);
    const clienteNombre = anonimo
      ? (String(raw['NombreFacturarA'] ?? '').trim() || 'Sr(a)')
      : (String(raw['FacturarA'] ?? '').trim() || String(raw['Cliente'] ?? '').trim() || 'Consumidor Final');

    return {
      nombreEmpresa,
      logoSrc,
      clienteNombre,
      codigoDocumento,
      fechaEmision,
      lineas: detalles.map((item) => ({
        cantidad: this.toNumber(item.CANTIDAD),
        descripcion: item.DESCRIPCION,
        precioUnitario: this.toNumber(item.PRECIO_UNITARIO),
        total: this.toNumber((item as unknown as { TotalVenta?: number }).TotalVenta ?? item.TOTAL)
      })),
      subtotal: this.toNumber(raw['Sumas']),
      descuento: this.toNumber(raw['Descuentos']),
      total: this.toNumber(raw['TotalFactura'])
    };
  }

  // Reenvío directo (sin maildte) para documentos FAC registrados en ambiente de pruebas: se
  // reconstruye el recibo a partir del encabezado/detalle del documento (no es el que está
  // abierto en el formulario) y se manda el mismo endpoint que el registro original.
  private enviarReciboDesdeListado(item: FacturaGeneralDto, correoDestino: string): Observable<unknown> {
    const idEmpresa = this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0;
    const idFactura = this.toNumber(item.iddoc);
    const sucursal = String(item.CODIGOSUCURSAL || item.SUCURSAL || '').trim();
    const puntoVenta = String(item.PUNTO_VENTA || '').trim();

    return forkJoin({
      encabezado: this.facturacionService.getFacturaEncabezado(item.Prefijo, item.Factura, sucursal, puntoVenta, idEmpresa),
      detalle: this.facturacionService.getFacturaDetalle(item.Prefijo, item.Factura, sucursal, puntoVenta, item.Tipo_Factura)
    }).pipe(
      switchMap(({ encabezado, detalle }) => {
        const datos = this.buildReciboDatos(encabezado as unknown as Record<string, unknown>, detalle ?? [], false);
        return from(this.reciboService.generarReciboPdfBase64(datos)).pipe(
          switchMap((pdfBase64) =>
            this.facturacionService.enviarReciboDirecto(idEmpresa, idFactura, 'FAC', correoDestino, pdfBase64, `Recibo_${idFactura}.pdf`)
          )
        );
      })
    );
  }

  private esDocumentoSinDte(item: FacturaGeneralDto): boolean {
    const tipo = String(item.Tipo_Factura ?? '').trim().toUpperCase();
    return this.emiteDte() && this.esAmbientePrueba() && tipo === 'FAC';
  }

  cambiarTipoFacturaCobro() {
    const idFactura = this.toNumber(this.facForm.controls.IdFactura.value);
    if (idFactura <= 0) {
      this.showError('FAC POS', 'Guarde la factura antes de cambiar el tipo.');
      return;
    }

    const idEmpresa = this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0;
    if (!idEmpresa) {
      this.showError('FAC POS', 'No se encontró la empresa en sesión.');
      return;
    }

    const tipoActual = this.getCurrentTipoFactura();
    const tipoNuevo = tipoActual === 'FAC' ? 'CCF' : 'FAC';
    const payload: UpdateCambioTipoFacturaDto = {
      IdFactura: idFactura,
      TipoFactura: tipoNuevo,
      IdEmpresa: idEmpresa
    };

    this.saving.set(true);
    this.facturacionService
      .updateCambioTipoFactura(payload)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (response) => {
          const idFacturaNuevo = this.extractIdFacturaNuevo(response);
          if (idFacturaNuevo <= 0) {
            this.showError('FAC POS', 'La API no devolvió un IdFactura válido para el cambio de tipo.');
            return;
          }

          this.facForm.patchValue({ IdFactura: idFacturaNuevo });
          this.tipoFacturaActual.set(tipoNuevo);
          this.selectedFactura.update((current) => {
            if (!current) {
              return current;
            }

            return {
              ...current,
              Tipo_Factura: tipoNuevo
            };
          });
          this.reloadFacturaDataAfterTipoChange(tipoNuevo, idFacturaNuevo);
        },
        error: (error) => {
          this.showError('FAC POS', this.extractError(error, 'No se pudo cambiar el tipo de factura.'));
        }
      });
  }

  private reloadFacturaDataAfterTipoChange(tipoFactura: string, idFacturaNuevo: number) {
    const selected = this.selectedFactura();
    const prefijo = String(selected?.Prefijo ?? '').trim();
    const factura = String(selected?.Factura ?? '').trim();
    const sucursal = String(selected?.CODIGOSUCURSAL || selected?.SUCURSAL || this.facForm.controls.Sucursal.value || '').trim();
    const puntoVenta = String(selected?.PUNTO_VENTA || this.facForm.controls.PuntoVenta.value || '').trim();
    const idEmpresa = this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0;

    if (!prefijo || !factura || !sucursal || !puntoVenta || !idEmpresa) {
      this.loadFacturaFormaPago(idFacturaNuevo);
      this.refreshFacturaTotales();
      this.syncTotalsFromDetalle();
      this.showInfo('FAC POS', `Tipo de factura cambiado a ${this.resolveTipoFacturaLabel(tipoFactura)}.`);
      return;
    }

    this.loadingDetail.set(true);
    forkJoin({
      encabezado: this.facturacionService.getFacturaEncabezado(prefijo, factura, sucursal, puntoVenta, idEmpresa),
      detalle: this.facturacionService.getFacturaDetalle(prefijo, factura, sucursal, puntoVenta, tipoFactura)
    })
      .pipe(finalize(() => {
        this.loadingDetail.set(false);
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: ({ encabezado, detalle }) => {
          this.facForm.patchValue({ IdFactura: idFacturaNuevo });
          this.patchEncabezado(encabezado);
          this.detalleRows.set(detalle ?? []);
          this.loadFacturaFormaPago(idFacturaNuevo);
          this.loadFacturaRetenciones(
            encabezado.Cliente,
            prefijo,
            factura,
            sucursal,
            puntoVenta,
            'IVA',
            this.toNumber(encabezado.Retencion)
          );
          this.refreshFacturaTotales();
          this.syncDisabledControls();
          this.showInfo('FAC POS', `Tipo de factura cambiado a ${this.resolveTipoFacturaLabel(tipoFactura)}.`);
        },
        error: (error) => {
          this.loadFacturaFormaPago(idFacturaNuevo);
          this.refreshFacturaTotales();
          this.showError('FAC POS', this.extractError(error, 'Se cambió el tipo, pero no se pudo refrescar detalle y totales.'));
        }
      });
  }

  desaplicar() {
    if (!this.adminAccess()) { this.showError('FAC POS', 'Solo un usuario Administrador puede habilitar la factura.'); return; }
    if (!this.canDesaplicar()) { this.showError('FAC POS', 'Solo facturas aplicadas sin sello permiten desaplicar.'); return; }
    const idFactura = this.facForm.controls.IdFactura.value;
    if (!idFactura) { this.showError('FAC POS', 'No hay factura para desaplicar.'); return; }
    this.executeDesaplicarFromCobro().subscribe({
      next: () => {
        this.isLocked.set(false);
        this.showCobroSection.set(false);
        this.facForm.patchValue({ Estado: 'ELABORACION' });
        this.syncDisabledControls();
        this.showInfo('FAC POS', 'Factura desaplicada.');
      },
      error: (error) => this.showError('FAC POS', this.extractError(error, 'No se pudo desaplicar.'))
    });
  }

  anularDte() {
    if (!this.canAnularDte()) { this.showError('FAC POS', 'Solo facturas aplicadas con sello permiten anular DTE.'); return; }
    const idFactura = this.facForm.controls.IdFactura.value;
    if (!idFactura) { this.showError('FAC POS', 'No hay factura para anular.'); return; }

    this.anulacionMotivo.set('');
    this.confirmAnulacionDialogVisible.set(false);
    this.anulacionDialogVisible.set(true);
    this.focusAnulacionMotivoInput();
  }

  cancelarAnulacionDialogo() {
    this.confirmAnulacionDialogVisible.set(false);
    this.anulacionDialogVisible.set(false);
    this.anulacionMotivo.set('');
  }

  refreshArticulos(): void {
    this.facturacionService.clearArticulosCache('BOD01');
    this.facturacionService.getArticulosPorBodega('BOD01').subscribe({
      next: (rows) => {
        const items = rows ?? [];
        this.articulosOptions.set(items);
        this.articuloSuggestions.set(items.map((item) => this.toArticuloDisplay(item)));
        this.articuloVisibleLimit.set(this.articuloChunkSize);
      },
      error: () => {
        this.articulosOptions.set([]);
        this.articuloSuggestions.set([]);
      }
    });
  }

  solicitarConfirmarAnulacion() {
    const motivo = this.anulacionMotivoNormalizado();
    if (!motivo) {
      this.showError('FAC POS', 'Debe ingresar un motivo de anulación válido.');
      this.focusAnulacionMotivoInput();
      return;
    }

    this.confirmAnulacionDialogVisible.set(true);
  }

  cancelarConfirmacionAnulacion() {
    this.confirmAnulacionDialogVisible.set(false);
    this.focusAnulacionMotivoInput();
  }

  confirmarAnulacionDocumento() {
    const idFactura = this.toNumber(this.facForm.controls.IdFactura.value);
    if (!idFactura) {
      this.showError('FAC POS', 'No hay factura para anular.');
      return;
    }

    const idEmpresa = this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0;
    if (!idEmpresa) {
      this.showError('FAC POS', 'No se encontró IdEmpresa en la sesión.');
      return;
    }

    const motivoAnulacion = this.anulacionMotivoNormalizado();
    if (!motivoAnulacion) {
      this.showError('FAC POS', 'Debe ingresar un motivo de anulación válido.');
      this.focusAnulacionMotivoInput();
      return;
    }

    const apiBaseUrl = this.authService.getEmissionApiBaseUrl();
    if (!apiBaseUrl) {
      this.showError('FAC POS', 'No se encontró UrlAPI en la sesión de empresa.');
      return;
    }

    const raw = this.facForm.getRawValue();
    const empresa = this.authService.currentUser()?.selectedEmpresa;
    const nombreSolicita = this.authService.getCurrentNombreUsuario() || String(this.authService.currentUser()?.username ?? '').trim();
    const duiSolicita = this.authService.getCurrentDui();
    if (!duiSolicita) {
      this.showError('FAC POS', 'No se encontró DUI del usuario para anular el DTE. Inicie sesión nuevamente.');
      return;
    }

    const payloadAnulacion: ParametrosDteAnulacionDto = {
      idEmpresa,
      idFactura,
      ambiente: this.getAmbiente(),
      codEstablecimiento: this.resolveCodigoSucursalMh(raw.Sucursal ?? '', raw.PuntoVenta ?? ''),
      codPuntoVenta: this.resolveCodigoPuntoMh(raw.Sucursal ?? '', raw.PuntoVenta ?? ''),
      user: String(this.authService.currentUser()?.username ?? '').trim(),
      motivo: {
        tipoAnulacion: 2,
        motivoAnulacion,
        nombreResponsable: String(empresa?.nombreComercial ?? empresa?.nombre ?? '').trim(),
        tipDocResponsable: '13',
        numDocResponsable: String(empresa?.nit ?? '').trim(),
        nombreSolicita: nombreSolicita || 'Usuario',
        tipDocSolicita: '36',
        numDocSolicita: duiSolicita
      }
    };

    const tipoFactura = this.getCurrentTipoFactura();
    const payloadAnularFactura: AnulacionFacturaDto = {
      codGeneracion: String(raw.CodGeneracion ?? '').trim(),
      Sucursal: String(raw.Sucursal ?? '').trim(),
      PuntoVenta: String(raw.PuntoVenta ?? '').trim(),
      TipoFactura: tipoFactura,
      ComentarioAnulacion: motivoAnulacion,
      usuario: String(this.authService.currentUser()?.username ?? '').trim()
    };

    const tipoFacturaDescripcion = getTipoFacturaDescripcion(tipoFactura);
    const perfilCorreo: DatosDestinatarioDteDto = {
      nombre: String(raw.FacturarA ?? raw.Cliente ?? '').trim() || 'Cliente',
      NombreComercialEmpresa: String(empresa?.nombreComercial ?? empresa?.nombre ?? '').trim(),
      fecEmi: this.ensureDate(raw.Fecha),
      nitemisor: String(empresa?.nit ?? '').trim(),
      numeroControl: String(raw.NoControl ?? '').trim(),
      codigoGeneracion: String(raw.CodGeneracion ?? '').trim(),
      sellorecepcion: String(raw.SelloRecepcion ?? '').trim(),
      totalPagar: this.toNumber(raw.TotalFactura),
      correoDestino: String(raw.CorreoElectronico ?? '').trim()
    };

    this.anulandoDte.set(true);
    this.confirmAnulacionDialogVisible.set(false);
    this.anulacionDialogVisible.set(false);

    this.facturacionService
      .postDteAnulacion(apiBaseUrl, payloadAnulacion)
      .pipe(
        switchMap((respuesta) => {
          const mensajeGeneral = String(respuesta?.MensajeGeneral ?? '').trim();
          const yaProcesado = mensajeGeneral.toUpperCase().includes('PROCESADO');
          const yaInvalidadoEnHacienda = mensajeGeneral.toUpperCase().includes('DOCUMENTO SE ENCUENTRA INVALIDADO');

          if (!yaProcesado && !yaInvalidadoEnHacienda) {
            throw new Error(mensajeGeneral || 'La API de anulación no devolvió estado PROCESADO.');
          }

          return this.facturacionService.anularFactura(payloadAnularFactura).pipe(map(() => mensajeGeneral));
        }),
        switchMap(() =>
          this.facturacionService
            .enviarDteAnulado(idEmpresa, tipoFacturaDescripcion, !environment.production, perfilCorreo)
            .pipe(
              catchError((correoError) => {
                this.showError('FAC POS', this.extractError(correoError, 'Documento anulado, pero falló el envío de correo de notificación.'));
                return of(null);
              })
            )
        ),
        finalize(() => {
          this.anulandoDte.set(false);
          this.anulacionMotivo.set('');
        })
      )
      .subscribe({
        next: () => {
          this.showInfo('FAC POS', 'Documento anulado correctamente.');
          this.refreshEncabezadoAfterEmission();
          this.loadMaestro();
        },
        error: (error) => this.showError('FAC POS', this.extractError(error, 'No se pudo anular.'))
      });
  }

  /** TODO: BORRAR – método temporal para probar envío de correo de anulación */
  testEnviarCorreoAnulado() {
    const raw = this.facForm.getRawValue();
    const empresa = this.authService.currentUser()?.selectedEmpresa;
    const idEmpresa = empresa?.idEmpresa ?? 0;
    if (!idEmpresa) { this.showError('FAC POS', 'No se encontró IdEmpresa en la sesión.'); return; }

    const tipoFactura = this.getCurrentTipoFactura();
    const tipoFacturaDescripcion = getTipoFacturaDescripcion(tipoFactura);
    const perfilCorreo: DatosDestinatarioDteDto = {
      nombre: String(raw.FacturarA ?? raw.Cliente ?? '').trim() || 'Cliente',
      NombreComercialEmpresa: String(empresa?.nombreComercial ?? empresa?.nombre ?? '').trim(),
      fecEmi: this.ensureDate(raw.Fecha),
      nitemisor: String(empresa?.nit ?? '').trim(),
      numeroControl: String(raw.NoControl ?? '').trim(),
      codigoGeneracion: String(raw.CodGeneracion ?? '').trim(),
      sellorecepcion: String(raw.SelloRecepcion ?? '').trim(),
      totalPagar: this.toNumber(raw.TotalFactura),
      correoDestino: String(raw.CorreoElectronico ?? '').trim()
    };

    this.anulandoDte.set(true);
    this.facturacionService
      .enviarDteAnulado(idEmpresa, tipoFacturaDescripcion, !environment.production, perfilCorreo)
      .pipe(finalize(() => this.anulandoDte.set(false)))
      .subscribe({
        next: () => this.showInfo('FAC POS', '[TEST] Correo de anulación enviado correctamente.'),
        error: (err) => this.showError('FAC POS', this.extractError(err, '[TEST] Falló el envío del correo de anulación.'))
      });
  }

  onAnulacionMotivoInput(value: string) {
    this.anulacionMotivo.set(String(value ?? ''));
  }

  private anulacionMotivoNormalizado(): string {
    return String(this.anulacionMotivo() ?? '').replace(/\s+/g, ' ').trim();
  }

  private focusAnulacionMotivoInput() {
    if (!isPlatformBrowser(this.platformId) || typeof document === 'undefined') {
      return;
    }

    requestAnimationFrame(() => {
      const input = document.getElementById('pos-anulacion-motivo') as HTMLInputElement | null;
      if (!input) {
        return;
      }

      input.focus();
      input.select();
    });
  }
adminAccess(): boolean {
    const tipoUsuario = String(this.authService.currentUser()?.tipoUsuario ?? '').trim().toUpperCase();
    if (tipoUsuario === 'A') return true;
    return false;
  }
  solicitarEliminarFactura() {
    if (!this.canEliminarFactura()) {
      this.showError('FAC POS', 'Solo facturas en elaboración o pendientes de emitir permiten eliminar.');
      return;
    }
if(!this.adminAccess()){
  this.showError('FAC POS', 'Solicite al administrador la eliminacion de esta factura.');
      return;
}
    this.eliminarConfirmDialog.abrir(() => this.eliminarFactura());
  }

  eliminarFactura(retryAfterDesaplicar: boolean = true) {
    if (!this.canEliminarFactura()) {
      this.showError('FAC POS', 'Solo facturas en elaboración o pendientes de emitir permiten eliminar.');
      return;
    }

    const idFactura = this.facForm.controls.IdFactura.value;
    if (!idFactura) {
      this.showError('FAC POS', 'No hay factura para eliminar.');
      return;
    }

    const raw = this.facForm.getRawValue();
    const selected = this.selectedFactura();
    const codGeneracion = String(raw.CodGeneracion ?? '').trim();
    const prefijo = String(selected?.Prefijo ?? codGeneracion.slice(0, 18)).trim();
    const factura = String(selected?.Factura ?? codGeneracion.slice(18)).trim();

    const payload: DeleteFacturaDto = {
      Prefijo: prefijo,
      Factura: factura,
      Sucursal: String(raw.Sucursal ?? '').trim(),
      PuntoVenta: String(raw.PuntoVenta ?? '').trim(),
      TipoFactura: this.getCurrentTipoFactura(),
      Fecha: this.ensureDate(raw.Fecha)
    };

    this.facturacionService.deleteFactura(payload).subscribe({
      next: () => {
        this.showInfo('FAC POS', 'Factura eliminada correctamente.');
        this.closeDetail();
        this.loadMaestro();
      },
      error: (error) => {
        if (retryAfterDesaplicar && this.shouldRetryDeleteAfterDesaplicar(error)) {
          this.executeDesaplicarFromCobro().subscribe({
            next: () => {
              this.cobroDialogVisible.set(false);
              this.eliminarFactura(false);
            },
            error: (desaplicarError) => {
              this.showError('FAC POS', this.extractError(desaplicarError, 'No se pudo desaplicar antes de eliminar la factura.'));
            }
          });
          return;
        }

        this.showError('FAC POS', this.extractError(error, 'No se pudo eliminar la factura.'));
      }
    });
  }

  vistaPrevia() {
    if (this.previewLoading()) {
      return;
    }

    if (!this.canVistaPrevia()) {
      this.showError('FAC POS', 'No se permite vista previa/imprimir para documentos anulados.');
      return;
    }

    const idFactura = this.toNumber(this.facForm.controls.IdFactura.value);
    if (!idFactura) {
      this.showError('FAC POS', 'Guarde la factura antes de abrir la vista previa.');
      return;
    }
// Interceptar aquí si es informal o registro sin DTE (ambiente de pruebas)
    if (!this.emiteDte() || this.esRegistroSinDte()) {
      // 1. NUEVA VALIDACIÓN: Evitar impresiones falsas o previas al cobro
    if (this.currentEstado() !== 'APLICADO') {
      this.showError('FAC POS', 'La factura debe estar aplicada (cobrada) para poder imprimir el ticket.');
      return;
    }
      this.imprimirTicketInformal();
      return;
    }
    const idEmpresa = this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0;
    if (!idEmpresa) {
      this.showError('FAC POS', 'No se encontró IdEmpresa en la sesión.');
      return;
    }

    const emitido = !this.isSelloRecepcionEmpty(this.facForm.controls.SelloRecepcion.value);
    this.openPreviewUrlWithFallback(emitido);
  }

  emitirDte() {
    if (!this.canEmit()) { this.showError('FAC POS', 'Solo facturas aplicadas sin sello permiten emitir DTE.'); return; }
    const idFactura = this.facForm.controls.IdFactura.value;
    if (!idFactura) { this.showError('FAC POS', 'Guarde la factura antes de emitir DTE.'); return; }
    if (!this.isEmpresaAutorizadaEmiteDte()) { this.showError('FAC POS', 'Empresa no autorizada para emitir DTE.'); return; }
    const apiBaseUrl = this.authService.getEmissionApiBaseUrl();
    if (!apiBaseUrl) { this.showError('FAC POS', 'No se encontró UrlAPI en la sesión de empresa.'); return; }

    const idEmpresa = this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0;
    const username = this.authService.currentUser()?.username ?? '';
    const raw = this.facForm.getRawValue();
    const tipoFactura = this.getCurrentTipoFactura();
    const tipoDocMh = this.resolveTipoDocMh(tipoFactura);
    const ambienteEmision = this.getAmbiente();
    const sqName = this.buildSecuenciaName(tipoFactura, idEmpresa, this.getAmbiente());
    const verificarSecuenciasDto: VerificarSecuenciasDto = {
      IdEmpresa: idEmpresa,
      AmbienteEmision: ambienteEmision,
      TipoFactura: tipoFactura,
      TipoDoc: tipoDocMh
    };
    const payload: ParametrosDteDto = {
      idFactura, idEmpresa, ambiente: ambienteEmision,
      codEstablecimiento: this.resolveCodigoSucursalMh(raw.Sucursal ?? '', raw.PuntoVenta ?? ''),
      codPuntoVenta: this.resolveCodigoPuntoMh(raw.Sucursal ?? '', raw.PuntoVenta ?? ''),
      user: username
    };

    this.openPanel();
    this.setStep('service', 'running', 'Verificando servicio de emisión');
    this.emitting.set(true);
    this.syncDisabledControls();

    this.facturacionService.serviceAvailable(apiBaseUrl).pipe(
      switchMap((status) => {
        if (String(status ?? '').trim().toLowerCase() !== 'online') throw new Error('Servicio no disponible.');
        this.setStep('service', 'ok', 'Servicio en línea');
        this.setStep('sequence', 'running', `Verificando secuencia ${sqName}`);
        return this.facturacionService.verificarSecuencias(verificarSecuenciasDto).pipe(
          map((response) => {
            const detail = String(response?.message ?? '').trim() || `Secuencia ${sqName} validada`;
            this.setStep('sequence', 'ok', detail);
            return true;
          }),
          catchError((error) => {
            const detail = this.extractError(error, 'No se pudo verificar secuencias.');
            this.setStep('sequence', 'error', detail);
            throw error;
          })
        );
      }),
      switchMap(() => {
        this.setStep('verify', 'running', 'Verificando estado previo');
        return this.refreshEncabezadoAfterEmission(false).pipe(
          map((encabezado) => ({ encabezado }))
        );
      }),
      switchMap(({ encabezado }) => {
        const yaEmitido = !!String(encabezado.SelloRecepcion ?? '').trim();

        if (yaEmitido) {
          this.setStep('verify', 'ok', 'Documento ya emitido');
          this.setStep('emit', 'ok', 'Sin nueva emisión requerida');
          this.setStep('sync', 'ok', 'Datos recuperados');
          this.setStep('correo', 'ok', 'No requerido');
          this.showInfo('FAC POS', 'El documento ya fue emitido previamente.');
          return of({ emitido: false, html: '' });
        }

        this.setStep('verify', 'ok', 'Listo para emisión');
        this.setStep('emit', 'running', 'Enviando a Hacienda');
        return this.facturacionService.emitirDte(apiBaseUrl, payload, tipoFactura).pipe(
          switchMap((response) => {
            if (!(response.SelloRecepcion ?? '').toString().trim()) {
              throw new Error(String(response.MensajeGeneral ?? 'Emisión sin sello de recepción.'));
            }

            this.setStep('emit', 'ok', 'Emitido correctamente');
            this.setStep('sync', 'running', 'Recuperando sello');

            return this.refreshEncabezadoAfterEmission(false).pipe(
              switchMap(() => {
                this.setStep('sync', 'ok', 'Datos actualizados');
                this.setStep('correo', 'running', 'Enviando correo y obteniendo formato visual');
                return this.facturacionService.enviarCorreoDte(idEmpresa, idFactura, tipoFactura).pipe(
                  map((html) => ({ emitido: true, html: this.normalizeDteVisualHtml(html) })),
                  catchError((correoError) => {
                    this.setStep('correo', 'error', this.extractError(correoError, 'No se pudo enviar correo ni recuperar formato visual.'));
                    return of({ emitido: true, html: '' });
                  })
                );
              })
            );
          })
        );
      }),
      finalize(() => {
        this.emitting.set(false);
        this.syncDisabledControls();
      })
    ).subscribe({
      next: ({ emitido, html }) => {
        if (emitido) {
          if (html) {
            this.openDteVisualPreview(html);
          } else {
            this.openPreviewUrlWithFallback(true);
          }
          this.setStep('correo', 'ok', 'Correo enviado y vista previa abierta');
          this.showInfo('FAC POS', 'DTE emitido correctamente.');
        }
        this.loadMaestro();
      },
      error: (error) => {
        this.setStep('emit', 'error', this.extractError(error, 'Falló la emisión.'));
        this.showError('FAC POS', this.extractError(error, 'Falló la emisión del DTE.'));
      }
    });
  }

  isReadOnlyField(): boolean {
    return this.emitting() || this.currentEstado() !== 'ELABORACION';
  }

  canEditPrecioLinea(): boolean {
    const tipoUsuario = String(this.authService.currentUser()?.tipoUsuario ?? '').trim().toUpperCase();
    if (tipoUsuario === 'A') return true;
    return Number(this.facForm.controls.LineaPrecio.value ?? 0) === 0;
  }

  currentEstado(): 'ELABORACION' | 'APLICADO' | 'ANULADO' | 'OTRO' {
    return this.normalizeEstadoValue(this.facForm.controls.Estado.value);
  }

  estadoVisualKey(estado: unknown, selloRecepcion: unknown): 'ELABORACION' | 'PENDIENTE_EMITIR' | 'EMITIDO' | 'ANULADO' | 'OTRO' {
    const normalized = this.normalizeEstadoValue(estado);
if(!this.emiteDte() || this.esRegistroSinDte()){
    if (normalized === 'APLICADO') {
      return 'EMITIDO';
    }
    return "ELABORACION";
  }
else{
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

  currentEstadoVisualLabel(): string {
    return this.estadoVisualLabel(
      this.facForm.controls.Estado.value,
      this.facForm.controls.SelloRecepcion.value
    );
  }

  currentEstadoVisualKey(): 'ELABORACION' | 'PENDIENTE_EMITIR' | 'EMITIDO' | 'ANULADO' | 'OTRO' {
    return this.estadoVisualKey(
      this.facForm.controls.Estado.value,
      this.facForm.controls.SelloRecepcion.value
    );
  }

  private normalizeEstadoValue(value: unknown): 'ELABORACION' | 'APLICADO' | 'ANULADO' | 'OTRO' {
    const estado = String(value ?? '').trim().toUpperCase();
    if (!estado || estado === 'BORRADOR' || estado === 'ELABORACION') return 'ELABORACION';
    if (estado === 'APLICADA' || estado === 'APLICADO') return 'APLICADO';
    if (estado === 'ANULADA' || estado === 'ANULADO') return 'ANULADO';
    return 'OTRO';
  }

  hasSelloRecepcion(): boolean {
    if(!this.emiteDte()){
      return true;
    }
    return !!String(this.facForm.controls.SelloRecepcion.value ?? '').trim();
  }

  private isSelloRecepcionEmpty(value: unknown): boolean {
    return !String(value ?? '').trim();
  }

  canSave(): boolean { return !this.emitting() && this.currentEstado() === 'ELABORACION'; }
  canApply(): boolean {
    if(!this.emiteDte() && this.currentEstado() === 'ELABORACION'){
      return true;
    }
    return !this.emitting() &&
      (this.currentEstado() === 'ELABORACION' || this.currentEstado() === 'APLICADO') &&
      !this.hasSelloRecepcion() &&
      !!this.facForm.controls.IdFactura.value;
  }
  canDesaplicar(): boolean { return !this.emitting() && this.currentEstado() === 'APLICADO' && !this.hasSelloRecepcion() && !!this.facForm.controls.IdFactura.value; }
  canEmit(): boolean { return !this.emitting() && this.currentEstado() === 'APLICADO' && !this.hasSelloRecepcion() && !!this.facForm.controls.IdFactura.value; }
  canAnularDte(): boolean { return !this.emitting() && this.currentEstado() === 'APLICADO' && this.hasSelloRecepcion() && !!this.facForm.controls.IdFactura.value; }
  canVistaPrevia(): boolean { return !!this.facForm.controls.IdFactura.value && this.currentEstadoVisualKey() !== 'ANULADO'; }
  canCambiarTipoFacturaCobro(): boolean {
    return !this.saving() && !this.emitting() && this.cobroDialogVisible() && !!this.facForm.controls.IdFactura.value;
  }
  canEliminarFactura(): boolean {
    const visual = this.currentEstadoVisualKey();
    return !this.emitting() &&
      !!this.facForm.controls.IdFactura.value &&
      (visual === 'ELABORACION' || visual === 'PENDIENTE_EMITIR');
  }

  selectInputText(event: FocusEvent) {
    const input = event.target as HTMLInputElement | null;
    if (!input || input.readOnly || input.disabled) return;
    requestAnimationFrame(() => input.select());
  }

  shouldSuppressMobileKeyboard(): boolean {
    if (!isPlatformBrowser(this.platformId) || typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(pointer: coarse) and (max-width: 991.98px)').matches;
  }

  onNumericKeyDown(event: KeyboardEvent) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key;
    const allowedKeys = ['Backspace', 'Delete', 'Tab', 'Enter', 'Escape', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (allowedKeys.includes(key) || /^[0-9]$/.test(key)) return;
    const target = event.target as HTMLInputElement | null;
    if ((key === '.' || key === ',') && target && !target.value.includes('.') && !target.value.includes(',')) return;
    event.preventDefault();
  }

  sanitizeNumericInput(event: Event) {
    const input = event.target as HTMLInputElement | null;
    if (!input) return;
    const normalized = input.value.replace(',', '.').replace(/[^0-9.]/g, '');
    const dotIndex = normalized.indexOf('.');
    const sanitized = dotIndex === -1 ? normalized : normalized.slice(0, dotIndex + 1) + normalized.slice(dotIndex + 1).replace(/\./g, '');
    if (sanitized !== input.value) {
      input.value = sanitized;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  onClienteComplete(query: string) {
    const normalized = String(query ?? '').trim().toLowerCase();
    const options = this.clientesOptions();
    if (!normalized) { this.clienteSuggestions.set([...options]); return; }
    this.clienteSuggestions.set(options.filter((item) => item.toLowerCase().includes(normalized)));
  }

  onClienteSelect(value: string) {
    const selectedNombre = String(value ?? '').trim();
    const profile = this.perfilClientes().find((item) => {
      const nombre = String(item.NOMBRE ?? '').trim().toLowerCase();
      const cliente = String(item.CLIENTE ?? '').trim().toLowerCase();
      return nombre === selectedNombre.toLowerCase() || cliente === selectedNombre.toLowerCase();
    });
    const cliente = String(profile?.CLIENTE ?? '').trim();
    const nombre = String(profile?.NOMBRE ?? selectedNombre).trim();
    const isAnonimo = nombre.toLowerCase() === 'sr(a)';
    this.isAnonimoClient.set(isAnonimo);
    this.facForm.patchValue({
      FacturarA: nombre || cliente,
      NombreFacturarA: isAnonimo ? 'Sr(a)' : '',
      Cliente: cliente,
      CondicionPago: profile?.CONDICION_PAGO ?? this.facForm.controls.CondicionPago.value ?? 'CONTADO',
      Vendedor: profile?.VENDEDOR ?? this.facForm.controls.Vendedor.value ?? '',
      NIT: profile?.NIT ?? '', Identificacion: profile?.IDENTIFICACION ?? '',
      RegistroComercio: profile?.REGISTRO_COMERCIO ?? '', Giro: profile?.Giro ?? '',
      CorreoElectronico: profile?.CORREO_ELECTRONICO ?? this.facForm.controls.CorreoElectronico.value ?? '',
      Pais: profile?.Pais ?? '',
      Departamento: profile?.Departamento ?? '',
      Municipio: profile?.Municipio ?? '',
      Direccion: profile?.DIRECCION ?? ''
    });
  }

  private requiresClienteConfirmation(): boolean {
    const facturarA = String(this.facForm.controls.FacturarA.value ?? '').trim();
    const cliente = String(this.facForm.controls.Cliente.value ?? '').trim();
    return !facturarA && !cliente;
  }

  private applyDefaultSrCliente() {
    const profile = this.perfilClientes().find((item) => String(item.NOMBRE ?? '').trim().toLowerCase() === 'sr(a)');

    this.isAnonimoClient.set(true);
    this.facForm.patchValue({
      FacturarA: 'Sr(a)',
      NombreFacturarA: 'Sr(a)',
      Cliente: String(profile?.CLIENTE ?? 'Sr(a)').trim(),
      CondicionPago: profile?.CONDICION_PAGO ?? this.facForm.controls.CondicionPago.value ?? 'CONTADO',
      Vendedor: profile?.VENDEDOR ?? this.facForm.controls.Vendedor.value ?? '',
      NIT: profile?.NIT ?? '',
      Identificacion: profile?.IDENTIFICACION ?? '',
      RegistroComercio: profile?.REGISTRO_COMERCIO ?? '',
      Giro: profile?.Giro ?? '',
      CorreoElectronico: profile?.CORREO_ELECTRONICO ?? this.facForm.controls.CorreoElectronico.value ?? '',
      Pais: profile?.Pais ?? '',
      Departamento: profile?.Departamento ?? '',
      Municipio: profile?.Municipio ?? '',
      Direccion: profile?.DIRECCION ?? ''
    });
  }

  onArticuloComplete(query: string) {
    const normalized = String(query ?? '').trim().toLowerCase();
    const options = this.articulosOptions().map((item) => this.toArticuloDisplay(item));
    if (!normalized) { this.articuloSuggestions.set(options); return; }
    this.articuloSuggestions.set(options.filter((item) => item.toLowerCase().includes(normalized)));
  }

  onArticuloSelect(displayValue: string) {
    const articulo = this.findArticuloByDisplay(String(displayValue ?? '').trim());
    if (!articulo) { this.facForm.patchValue({ LineaArticulo: '', LineaDescripcion: '' }); this.articuloExistencia.set(null); return; }
    this.articuloExistencia.set(null);
    this.facForm.patchValue({
      LineaArticuloDisplay: this.toArticuloDisplay(articulo),
      LineaArticulo: articulo.ARTICULO,
      LineaDescripcion: articulo.DESCRIPCION,
      LineaPrecio: articulo.ULTIMO_PRECIO ?? 0,
      LineaPrecioMayoreo: articulo.PRECIO_MAYOREO ?? 0,
      LineaCantidadMinimaMayoreo: articulo.cantidadmayoreo ?? 0
    });
    this.focusLineaCantidadInput();
    // Precio y existencia en línea (autoritativos sobre el catálogo cacheado).
    this.cargarInfoVentaEnLinea(articulo.ARTICULO, (info) => {
      this.facForm.patchValue({
        LineaPrecio: info.ultimoPrecio,
        LineaPrecioMayoreo: info.precioMayoreo,
        LineaCantidadMinimaMayoreo: info.cantidadMayoreo
      });
    });
  }

  // Consulta en línea precio + existencia del artículo y aplica los valores frescos.
  // Si no hay existencia, avisa. En error de red, conserva los valores del catálogo.
  private cargarInfoVentaEnLinea(articulo: string, aplicar: (info: InfoVentaArticuloDto) => void): void {
    this.facturacionService.getInfoVentaArticulo(articulo, 'BOD01').subscribe({
      next: (info) => {
        if (!info) { return; }
        aplicar(info);
        this.articuloExistencia.set(this.toNumber(info.existencia));
        if (this.toNumber(info.existencia) <= 0) {
          this.showWarn('FAC POS', 'No hay existencia disponible.');
        }
      },
      error: () => { /* sin conexión: se mantienen los valores del catálogo */ }
    });
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
    this.articuloVisibleLimit.update((current) => current + this.articuloChunkSize);
    this.ensureVisibleArticuloImages();
  }

  selectArticuloCard(articulo: ArticuloPorBodegaDto) {
    if (this.isReadOnlyField()) {
      return;
    }

    this.ensureArticuloImageLoaded(articulo.ARTICULO);

    this.selectedArticuloImagen.set(articulo);
    this.articuloExistencia.set(null);
    const ultimoPrecio = this.toNumber(articulo.ULTIMO_PRECIO);
    this.articuloImagenForm.reset({
      cantidad: 1,
      precio: ultimoPrecio > 0 ? ultimoPrecio : 0,
      preciomayoreo: articulo.PRECIO_MAYOREO ?? 0
    });
    this.articuloImagenDialogVisible.set(true);
    // Precio y existencia en línea (autoritativos sobre el catálogo cacheado).
    this.cargarInfoVentaEnLinea(articulo.ARTICULO, (info) => {
      this.articuloImagenForm.patchValue({
        precio: info.ultimoPrecio,
        preciomayoreo: info.precioMayoreo
      });
    });
  }

  openScannerDialog() {
    if (this.isReadOnlyField() || this.scannerBusy()) {
      return;
    }

    if (!isPlatformBrowser(this.platformId) || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.showError('Escáner', 'El dispositivo no soporta acceso a cámara para escanear códigos.');
      return;
    }

    if (!this.isBarcodeDetectorAvailable()) {
      this.showError('Escáner', 'Este navegador no soporta detección de códigos de barras/QR.');
      return;
    }

    this.scannerDialogVisible.set(true);
    this.scannerStatusMessage.set('Inicializando cámara...');
    // Forzar scroll y focus al diálogo de escaneo
    setTimeout(() => {
      if (typeof document !== 'undefined') {
        const dialog = document.querySelector('.pos-scan-dialog');
        if (dialog) {
          dialog.scrollIntoView({ behavior: 'smooth', block: 'center' });
          if (dialog instanceof HTMLElement) dialog.focus();
        }
      }
    }, 300);

    let attempts = 0;
    const maxAttempts = 20; // ~2 segundos
    const tryStartScanner = () => {
      const video = this.getScannerVideoElement();
      // Log de depuración
      if (typeof console !== 'undefined') {
        console.log('[SCAN] Attempt', attempts, 'video:', video);
        if (video) {
          console.log('[SCAN] video display:', getComputedStyle(video).display, 'visibility:', getComputedStyle(video).visibility);
        }
      }
      if (video) {
        void this.startScanner();
      } else if (attempts < maxAttempts) {
        attempts++;
        setTimeout(tryStartScanner, 100);
      } else {
        if (typeof console !== 'undefined') {
          console.error('[SCAN] No se encontró el visor de cámara tras', maxAttempts, 'intentos');
        }
        this.showError('Escáner', 'No se encontró el visor de cámara para escanear. Intente nuevamente.');
        this.closeScannerDialog();
      }
    };
    tryStartScanner();
  }

  closeScannerDialog() {
    this.scannerDialogVisible.set(false);
    this.stopScanner();
  }

  onScannerDialogHide() {
    this.stopScanner();
  }

  closeArticuloImagenDialog() {
    this.articuloImagenDialogVisible.set(false);
    this.selectedArticuloImagen.set(null);
  }

  articuloImagenRequierePrecio(): boolean {
    return this.toNumber(this.selectedArticuloImagen()?.ULTIMO_PRECIO) <= 0;
  }

  confirmarAgregarArticuloImagen() {
    const articulo = this.selectedArticuloImagen();
    if (!articulo) {
      return;
    }

    const cantidad = this.toNumber(this.articuloImagenForm.controls.cantidad.value);
    if (cantidad <= 0) {
      this.showError('Artículos', 'La cantidad debe ser mayor que cero.');
      return;
    }

    const precioBase = this.toNumber(articulo.ULTIMO_PRECIO);
    const precio = precioBase > 0
      ? precioBase
      : this.toNumber(this.articuloImagenForm.controls.precio.value);

    if (this.articuloImagenRequierePrecio() && precio <= 0) {
      this.showError('Artículos', 'Ingrese un precio válido para continuar.');
      return;
    }

    this.facForm.patchValue({
      LineaArticuloDisplay: this.toArticuloDisplay(articulo),
      LineaArticulo: articulo.ARTICULO,
      LineaDescripcion: articulo.DESCRIPCION,
      LineaCantidad: cantidad,
      LineaPrecio: precio
    });

    this.agregarDetalleManual();
    this.closeArticuloImagenDialog();
  }

  articuloImagenUrl(codigo: string): string | null {
    return this.articuloImagenUrls()[codigo] ?? null;
  }

  private focusLineaCantidadInput() {
    if (!isPlatformBrowser(this.platformId) || typeof document === 'undefined') return;
    requestAnimationFrame(() => {
      const input = document.getElementById('pos-qty') as HTMLInputElement | null;
      if (!input || input.readOnly || input.disabled) return;
      input.focus();
      input.select();
    });
  }

  private focusLineaPrecioInput() {
    if (!isPlatformBrowser(this.platformId) || typeof document === 'undefined') return;
    requestAnimationFrame(() => {
      const input = document.getElementById('pos-price') as HTMLInputElement | null;
      if (!input || input.readOnly || input.disabled) return;
      input.focus();
      input.select();
    });
  }

  private async startScanner(): Promise<void> {
    if (!this.scannerDialogVisible() || this.scannerBusy()) {
      return;
    }

    const video = this.getScannerVideoElement();
    if (typeof console !== 'undefined') {
      console.log('[SCAN] startScanner video:', video);
      if (video) {
        console.log('[SCAN] video display:', getComputedStyle(video).display, 'visibility:', getComputedStyle(video).visibility);
      }
    }
    if (!video) {
      this.showError('Escáner', 'No se encontró el visor de cámara para escanear.');
      if (typeof console !== 'undefined') {
        console.error('[SCAN] startScanner: video no encontrado');
      }
      this.closeScannerDialog();
      return;
    }

    this.scannerBusy.set(true);
    this.scannerStatusMessage.set('Apunta al código para lectura automática.');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 24, max: 30 }
        }
      });
      if (typeof console !== 'undefined') {
        console.log('[SCAN] getUserMedia stream:', stream);
      }
      this.scannerVideoStream = stream;
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      await video.play();
      this.scannerLastTickAt = 0;
      this.scanVideoFrame(video);
    } catch (err) {
      this.showError('Escáner', 'No fue posible activar la cámara. Revise permisos e intente de nuevo.');
      if (typeof console !== 'undefined') {
        console.error('[SCAN] getUserMedia error:', err);
      }
      this.closeScannerDialog();
    }
  }

  private stopScanner(): void {
    if (this.scannerRafId !== null) {
      cancelAnimationFrame(this.scannerRafId);
      this.scannerRafId = null;
    }

    if (this.scannerVideoStream) {
      for (const track of this.scannerVideoStream.getTracks()) {
        track.stop();
      }
      this.scannerVideoStream = null;
    }

    const video = this.getScannerVideoElement();
    if (video) {
      video.pause();
      video.srcObject = null;
    }

    this.scannerBusy.set(false);
  }

  private scanVideoFrame(video: HTMLVideoElement): void {
    if (!this.scannerDialogVisible() || !this.scannerBusy()) {
      return;
    }

    this.scannerRafId = requestAnimationFrame(() => this.scanVideoFrame(video));
    const now = performance.now();
    if (now - this.scannerLastTickAt < 150) {
      return;
    }
    this.scannerLastTickAt = now;

    const detector = this.getBarcodeDetector();
    if (!detector || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return;
    }

    detector.detect(video)
      .then((codes) => {
        const raw = String(codes?.[0]?.rawValue ?? '').trim();
        if (!raw) {
          return;
        }

        this.handleDetectedCode(raw);
      })
      .catch(() => {});
  }

  private handleDetectedCode(rawCode: string): void {
    this.stopScanner();
    this.scannerDialogVisible.set(false);

    const validation = this.validateScannedCode(rawCode);
    if (!validation.valid || !validation.normalizedCode) {
      this.showError('Escáner', validation.message ?? 'Código no válido para SKU/barcode interno.');
      return;
    }

    const articulo = this.findArticuloByScanValue(validation.normalizedCode);
    if (!articulo) {
      this.showError('Escáner', `No se encontró un artículo para el código ${validation.normalizedCode}.`);
      return;
    }

    this.selectArticuloCard(articulo);
    this.showInfo('Escáner', `Artículo detectado: ${articulo.ARTICULO}.`);
  }

  private validateScannedCode(rawCode: string): { valid: boolean; normalizedCode?: string; message?: string } {
    const raw = String(rawCode ?? '').trim();
    if (!raw) {
      return { valid: false, message: 'No se leyó ningún código.' };
    }

    const lower = raw.toLowerCase();
    if (lower.includes('http://') || lower.includes('https://') || lower.includes('www.')) {
      return { valid: false, message: 'Se detectó un link. Solo se permiten códigos de barra o SKU internos.' };
    }

    if (raw.length > 256) {
      return { valid: false, message: 'El contenido leído es demasiado largo para un código SKU/barra válido.' };
    }

    const tokens = this.extractScanTokens(raw);
    if (!tokens.length) {
      return { valid: false, message: 'El formato leído no cumple el estándar esperado para SKU/barcode.' };
    }

    const candidate = tokens[0];
    if (candidate.length < 4 || candidate.length > 64) {
      return { valid: false, message: 'La longitud del código no está dentro del rango esperado (4 a 64).' };
    }

    return { valid: true, normalizedCode: candidate };
  }

  private findArticuloByScanValue(scannedValue: string): ArticuloPorBodegaDto | undefined {
    const normalized = this.normalizeScanToken(scannedValue);
    if (!normalized) {
      return undefined;
    }

    return this.articulosOptions().find((item) => this.normalizeScanToken(item.ARTICULO) === normalized);
  }

  private extractScanTokens(raw: string): string[] {
    const values = String(raw ?? '')
      .replace(/[\r\n\t]+/g, ' ')
      .split(/[^A-Za-z0-9._\-/]+/)
      .map((item) => this.normalizeScanToken(item))
      .filter((item) => item.length >= 4 && item.length <= 64);

    const seen = new Set<string>();
    const unique: string[] = [];
    for (const token of values) {
      if (seen.has(token)) {
        continue;
      }

      seen.add(token);
      unique.push(token);
    }

    return unique.sort((a, b) => b.length - a.length);
  }

  private normalizeScanToken(value: string): string {
    return String(value ?? '').trim().toUpperCase();
  }

  private isBarcodeDetectorAvailable(): boolean {
    return this.getBarcodeDetectorCtor() !== null;
  }

  private getBarcodeDetector(): BarcodeDetectorLike | null {
    if (this.scannerDetector) {
      return this.scannerDetector;
    }

    const detectorCtor = this.getBarcodeDetectorCtor();
    if (!detectorCtor) {
      return null;
    }

    this.scannerDetector = new detectorCtor({ formats: this.scanAllowedFormats });
    return this.scannerDetector;
  }

  private getBarcodeDetectorCtor(): BarcodeDetectorCtorLike | null {
    if (!isPlatformBrowser(this.platformId) || typeof window === 'undefined') {
      return null;
    }

    const maybeCtor = (window as Window & { BarcodeDetector?: BarcodeDetectorCtorLike }).BarcodeDetector;
    return maybeCtor ?? null;
  }

  private getScannerVideoElement(): HTMLVideoElement | null {
    if (!isPlatformBrowser(this.platformId) || typeof document === 'undefined') {
      return null;
    }

    return document.getElementById('pos-scanner-video') as HTMLVideoElement | null;
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

  private clearArticuloImageUrls(): void {
    const existing = this.articuloImagenUrls();
    for (const url of Object.values(existing)) {
      URL.revokeObjectURL(url);
    }
    this.articuloImagenLoading.clear();
    this.articuloImagenUrls.set({});
  }

  private simulateLargeCatalog(items: ArticuloPorBodegaDto[]): ArticuloPorBodegaDto[] {
    if (!this.simulateLargeCatalogForTest || items.length <= 0) {
      return items;
    }

    const target = Math.max(this.simulatedCatalogTarget, items.length);
    const expanded: ArticuloPorBodegaDto[] = [];
    let i = 0;

    while (expanded.length < target) {
      const source = items[i % items.length];
      const seq = expanded.length + 1;
      expanded.push({
        ...source,
        ARTICULO: `${source.ARTICULO}-T${String(seq).padStart(3, '0')}`,
        DESCRIPCION: `${source.DESCRIPCION}`
      });
      i += 1;
    }

    return expanded;
  }

  onRetencionChange(value: string) {
    if (this.isNewUnsaved()) return;
    const retencionCodigo = String(value ?? '').trim();
    if (!retencionCodigo) {
      this.eliminarRetencionAplicada();
      return;
    }
    this.facForm.patchValue({ RetencionIvaCodigo: retencionCodigo });
    this.syncTotalsFromDetalle();
    this.updateFacturaRetencion(retencionCodigo);
  }

  eliminarRetencionAplicada() {
    if (this.isReadOnlyField() || this.isNewUnsaved()) return;

    this.facForm.patchValue({ RetencionIvaCodigo: '' });
    this.syncTotalsFromDetalle();
    this.updateFacturaRetencion('');
  }

  private loadFacturaRetenciones(
    cliente: string,
    prefijo: string,
    factura: string,
    sucursal: string,
    puntoVenta: string,
    tipoRetencion: string = 'IVA',
    retencionAplicada: number = 0
  ) {
    const prefijoText = String(prefijo ?? '').trim();
    const facturaText = String(factura ?? '').trim();
    if (!prefijoText || !facturaText) {
      this.retencionAplicada.set(null);
      this.facForm.patchValue({ RetencionIvaCodigo: '' });
      this.syncTotalsFromDetalle();
      return;
    }

    this.facturacionService
      .getFacturaRetenciones(
        String(cliente ?? '').trim(),
        prefijoText,
        facturaText,
        String(sucursal ?? '').trim(),
        String(puntoVenta ?? '').trim(),
        String(tipoRetencion ?? '').trim()
      )
      .subscribe({
        next: (rows) => {
          const mapped = (rows ?? [])
            .map((row: FacturaRetencionDto) => ({
              codigo: String(row.TIPORETENCION ?? row.RETENCION ?? '').trim(),
              descripcion: String(row.RETENCION ?? row.TIPORETENCION ?? '').trim(),
              monto: this.toNumber(row.Monto)
            }))
            .filter((item) => !!item.codigo);

          if (!mapped.length) {
            this.retencionAplicada.set(null);
            this.facForm.patchValue({ RetencionIvaCodigo: '' });
            this.syncTotalsFromDetalle();
            return;
          }

          const retMonto = this.toNumber(retencionAplicada);
          const selected = retMonto > 0
            ? (mapped.find((item) => Math.abs(this.toNumber(item.monto) - retMonto) <= 0.01) ?? mapped[0])
            : mapped[0];

          this.facForm.patchValue({ RetencionIvaCodigo: selected.codigo });
          this.retencionAplicada.set({
            codigo: selected.codigo,
            descripcion: selected.descripcion,
            monto: this.toNumber(selected.monto)
          });
          this.applyRetencionMonto(this.toNumber(selected.monto));
        },
        error: () => {
          this.retencionAplicada.set(null);
        }
      });
  }

  private refreshRetencionAplicadaFromBackend() {
    const context = this.getRetencionQueryContext();
    if (!context.prefijo || !context.factura) {
      this.retencionAplicada.set(null);
      this.facForm.patchValue({ RetencionIvaCodigo: '', IvaRetenido: 0 });
      this.syncTotalsFromDetalle();
      return;
    }

    this.facturacionService
      .getFacturaRetenciones(
        context.cliente,
        context.prefijo,
        context.factura,
        context.sucursal,
        context.puntoVenta,
        'IVA'
      )
      .subscribe({
        next: (rows) => {
          const mapped = (rows ?? [])
            .map((row: FacturaRetencionDto) => ({
              codigo: String(row.TIPORETENCION ?? row.RETENCION ?? '').trim(),
              descripcion: String(row.RETENCION ?? row.TIPORETENCION ?? '').trim(),
              monto: this.toNumber(row.Monto)
            }))
            .filter((item) => !!item.codigo);

          if (!mapped.length) {
            this.retencionAplicada.set(null);
            this.facForm.patchValue({ RetencionIvaCodigo: '', IvaRetenido: 0 });
            this.syncTotalsFromDetalle();
            return;
          }

          const selected = mapped.find((item) => this.toNumber(item.monto) > 0) ?? mapped[0];
          this.facForm.patchValue({ RetencionIvaCodigo: selected.codigo });
          this.retencionAplicada.set({
            codigo: selected.codigo,
            descripcion: selected.descripcion,
            monto: this.toNumber(selected.monto)
          });
          this.applyRetencionMonto(this.toNumber(selected.monto));
        },
        error: () => {
          this.retencionAplicada.set(null);
          this.facForm.patchValue({ RetencionIvaCodigo: '', IvaRetenido: 0 });
          this.syncTotalsFromDetalle();
        }
      });
  }

  private getRetencionQueryContext(): { cliente: string; prefijo: string; factura: string; sucursal: string; puntoVenta: string } {
    const raw = this.facForm.getRawValue();
    const selected = this.selectedFactura();
    return {
      cliente: String(raw.Cliente ?? '').trim(),
      prefijo: String(selected?.Prefijo ?? '').trim(),
      factura: String(selected?.Factura ?? '').trim(),
      sucursal: String(selected?.CODIGOSUCURSAL || selected?.SUCURSAL || raw.Sucursal || '').trim(),
      puntoVenta: String(selected?.PUNTO_VENTA || raw.PuntoVenta || '').trim()
    };
  }

  private applyRetencionMonto(retencionMonto: number) {
    const idFactura = this.toNumber(this.facForm.controls.IdFactura.value);
    if (idFactura > 0 && this.hasSavedCurrentRecord()) {
      this.refreshFacturaTotales();
      return;
    }

    const totals = this.computeTotalsFromDetalleRows(this.detalleRows(), null, retencionMonto);

    this.facForm.patchValue({
      Sumas: totals.sumas,
      Descuentos: totals.descuentos,
      TotalOperacion: totals.totalOperacion,
      SubTotalVentas: totals.subTotalVentas,
      TotalImpuesto1: totals.iva,
      IvaRetenido: totals.retencion,
      TotalFactura: totals.totalFactura
    });
    this.cdr.markForCheck();
  }

  agregarFormaPago() {
    if (this.isReadOnlyField()) return;
    if (this.isNewUnsaved()) { this.showError('FAC POS', 'Guarde primero antes de agregar formas de pago.'); return; }
    const idFactura = this.toNumber(this.facForm.controls.IdFactura.value);
    const codigo = String(this.facForm.controls.FormaPagoCodigo.value ?? '').trim();
    const monto = this.toNumber(this.facForm.controls.FormaPagoMonto.value);
    if (!codigo) { this.showError('FAC POS', 'Seleccione una forma de pago.'); return; }
    if (monto <= 0) { this.showError('FAC POS', 'El monto debe ser mayor a cero.'); return; }
    const forma = this.formasPagoOptions().find((item) => String(item.Codigo ?? '').trim() === codigo);
    const descripcion = String(forma?.Descripcion ?? codigo).trim();

    const payload: UpdateFacturaFormaPagoDto = {
      IdFactura: idFactura,
      Codigo: codigo,
      Monto: monto,
      TipoMtto: 'A'
    };

    this.facturacionService.updateFacturaFormaPago(payload).subscribe({
      next: () => {
        this.loadFacturaFormaPago(idFactura);
        this.facForm.patchValue({ FormaPagoMonto: 0 });
      },
      error: (error) => {
        this.showError('FAC POS', this.extractError(error, 'No se pudo registrar la forma de pago.'));
      }
    });
  }

  eliminarFormaPago(index: number) {
    if (this.isReadOnlyField()) return;
    if (this.isNewUnsaved()) return;

    const idFactura = this.toNumber(this.facForm.controls.IdFactura.value);
    const row = this.formasPagoDetalle()[index];
    if (!row) {
      return;
    }

    const payload: UpdateFacturaFormaPagoDto = {
      IdFactura: idFactura,
      Codigo: String(row.codigo ?? '').trim(),
      Monto: this.toNumber(row.monto),
      TipoMtto: 'B'
    };

    this.facturacionService.updateFacturaFormaPago(payload).subscribe({
      next: () => {
        this.loadFacturaFormaPago(idFactura);
      },
      error: (error) => {
        this.showError('FAC POS', this.extractError(error, 'No se pudo eliminar la forma de pago.'));
      }
    });
  }

  private loadFacturaFormaPago(idFactura: number) {
    if (idFactura <= 0) {
      this.formasPagoDetalle.set([]);
      return;
    }

    this.facturacionService.getFacturaFormaPago(idFactura).subscribe({
      next: (rows) => {
        const mapped = (rows ?? []).map((row: FacturaFormaPagoDto) => ({
          codigo: String(row.Codigo ?? '').trim(),
          descripcion: String(row.Descripcion ?? row.Codigo ?? '').trim(),
          monto: this.toNumber(row.Monto)
        }));
        this.formasPagoDetalle.set(mapped);
      },
      error: (error) => {
        this.formasPagoDetalle.set([]);
        this.showError('FAC POS', this.extractError(error, 'No se pudieron cargar las formas de pago de la factura.'));
      }
    });
  }

  formatCurrency(value: unknown): string {
    return this.currencyFormatter.format(this.toNumber(value));
  }

  displayDescuentoNegativo(): number {
    return -Math.abs(this.toNumber(this.facForm.controls.Descuentos.value));
  }

  formatDateDisplay(value: unknown): string {
    const text = String(value ?? '').trim();
    if (!text) return '—';

    const slashDateWithOptionalTime = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp][Mm])?)?$/);
    if (slashDateWithOptionalTime) {
      const first = Number(slashDateWithOptionalTime[1]);
      const second = Number(slashDateWithOptionalTime[2]);
      const year = slashDateWithOptionalTime[3];
      const hasMeridiem = /\b(?:AM|PM)\b/i.test(text);

      let day = first;
      let month = second;

      if (hasMeridiem || second > 12) {
        month = first;
        day = second;
      }

      return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
    }

    const yyyyMmDdWithOptionalTime = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+.*)?$/);
    if (yyyyMmDdWithOptionalTime) {
      return `${yyyyMmDdWithOptionalTime[3]}/${yyyyMmDdWithOptionalTime[2]}/${yyyyMmDdWithOptionalTime[1]}`;
    }

    const normalized = text.includes('T') ? text : text.replace(' ', 'T');
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) {
      return text;
    }

    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  }

  resolveTipoFacturaLabel(tipoFactura: unknown): string {
    return getTipoFacturaDescripcion(tipoFactura);
  }

  agregarDetalleManual(skipAutoSave: boolean = false) {
    if (this.isReadOnlyField()) return;
    if (this.saving()) return;
    const articulo = String(this.facForm.controls.LineaArticulo.value ?? '').trim();
    const descripcion = String(this.facForm.controls.LineaDescripcion.value ?? '').trim();
    const cantidad = this.toNumber(this.facForm.controls.LineaCantidad.value);
    const precio = this.toNumber(this.facForm.controls.LineaPrecio.value);
    if (!articulo) { this.showError('FAC POS', 'Seleccione un artículo.'); return; }
    if (!descripcion) { this.showError('FAC POS', 'Ingrese una descripción.'); return; }
    if (cantidad <= 0 || precio < 0) { this.showError('FAC POS', 'Cantidad y precio deben ser válidos.'); return; }
    if (precio === 0) { this.showError('FAC POS', 'El precio no puede ser cero.'); return; }

    if (!skipAutoSave && this.toNumber(this.facForm.controls.IdFactura.value) <= 0 && this.isNewUnsaved()) {
      this.guardarEncabezadoConSrAParaAgregarDetalle();
      return;
    }

    const incluyeIva = !!this.facForm.controls.IncluyeIVA.value;
    const precioUnitarioDetalle = precio;// incluyeIva ? precio : Number((precio * 1.13).toFixed(6));
    const nextLine = this.detalleRows().length + 1;
    const total = Number((cantidad * precioUnitarioDetalle).toFixed(2));

    const newRow: FacturaDetalleDto = {
      LINEA: nextLine,
      ARTICULO: articulo,
      DESCRIPCION: descripcion,
      CALIDAD: '',
      CANTIDAD: cantidad,
      PRECIO_UNITARIO: precioUnitarioDetalle,
      COSTO_UNITARIO: 0,
      TOTAL: total,
      UNIDAD_MEDIDA: '',
      BODEGA: '',
      CENTROCOSTOINVENTARIO: '',
      CUENTACONTABLEINVENTARIO: '',
      TIPO_ARTICULO: '',
      CANTIDAD_KARDEX: cantidad,
      UNIDAD_MEDIDA_KARDEX: '',
      ID_COLOR: 0,
      COLOR: '',
      IdAcabado: '',
      Acabado: '',
      TIPO_COLOR: '',
      TipoDescuento: '',
      Descuento: 0,
      TotalVenta: total
    };

    const rowsPreview = [...this.detalleRows(), newRow];
    const totalsPreview = this.computeTotalsFromDetalleRows(rowsPreview, this.facForm.controls.RetencionIvaCodigo.value);
    const payload = this.buildUpdateDetalleFacturaPayload(newRow, totalsPreview);

    this.facturacionService.updateDetalleFactura(payload).subscribe({
      next: () => {
       this.refreshDetalleYTotales();
        this.facForm.patchValue({ LineaArticuloDisplay: '', LineaArticulo: '', LineaDescripcion: '', LineaCantidad: 1, LineaPrecio: 0 });
      },
      error: (error) => {
        this.showError('FAC POS', this.extractError(error, 'No se pudo registrar el detalle de factura.'));
      }
    });
  }

  private guardarEncabezadoConSrAParaAgregarDetalle() {
    if (this.saving()) return;

    if (this.requiresClienteConfirmation()) {
      this.applyDefaultSrCliente();
    }
    const payload = this.buildUpdateFacturaPayload();

    this.saving.set(true);
    this.facturacionService
      .updateFactura(payload)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (response) => {
          this.patchIdFacturaFromUpdateResponse(response);
          const idFactura = this.toNumber(this.facForm.controls.IdFactura.value);
          if (idFactura > 0) {
            this.loadFacturaFormaPago(idFactura);
          }
          this.saving.set(false);
          this.hasSavedCurrentRecord.set(true);
          this.syncDisabledControls();
          const raw = this.facForm.getRawValue();
          const clienteGuardado = String(raw.FacturarA ?? raw.Cliente ?? '').trim() || 'Sr(a)';
          this.showInfo('FAC POS', `Encabezado guardado con cliente ${clienteGuardado}.`);
          this.agregarDetalleManual(true);
        },
        error: (error) => {
          this.showError(
            'FAC POS',
            this.extractError(error, 'No se pudo guardar el encabezado antes de agregar el detalle.')
          );
        }
      });
  }

  eliminarDetalle(linea: number) {
    if (this.isReadOnlyField()) return;
    if (this.isNewUnsaved()) return;

    const rowToDelete = this.detalleRows().find((r) => r.LINEA === linea);
    if (!rowToDelete) {
      return;
    }

    const rowsAfter = this.detalleRows()
      .filter((r) => r.LINEA !== linea)
      .map((r, i) => ({ ...r, LINEA: i + 1 }));
    const totalsAfter = this.computeTotalsFromDetalleRows(rowsAfter, this.facForm.controls.RetencionIvaCodigo.value);
    const payload = this.buildUpdateDetalleFacturaPayload(rowToDelete, totalsAfter, 'B');

    this.facturacionService.updateDetalleFactura(payload).subscribe({
      next: () => {
        this.refreshDetalleYTotales();
      },
      error: (error) => {
        this.showError('FAC POS', this.extractError(error, 'No se pudo eliminar el detalle de factura.'));
      }
    });
  }

  private syncTotalsFromDetalle() {
    const idFactura = this.toNumber(this.facForm.controls.IdFactura.value);
    if (idFactura > 0 && this.hasSavedCurrentRecord()) {
      this.refreshFacturaTotales();
      return;
    }

    const totals = this.computeTotalsFromDetalleRows(this.detalleRows(), this.facForm.controls.RetencionIvaCodigo.value);

    this.facForm.patchValue({
      Sumas: totals.sumas,
      Descuentos: totals.descuentos,
      TotalOperacion: totals.totalOperacion,
      SubTotalVentas: totals.subTotalVentas,
      TotalImpuesto1: totals.iva,
      IvaRetenido: totals.retencion,
      TotalFactura: totals.totalFactura
    });
    this.cdr.markForCheck();
  }

  private computeTotalsFromDetalleRows(
    rows: FacturaDetalleDto[],
    retencionCode: string | null | undefined,
    retencionMonto?: number
  ): { sumas: number; descuentos: number; totalOperacion: number; iva: number; subTotalVentas: number; retencion: number; totalFactura: number } {
    const totalAntesRet = this.roundAmount(rows.reduce((acc, row) => acc + this.toNumber(row.TotalVenta || row.TOTAL), 0));
    const iva = this.roundAmount(totalAntesRet * (13 / 113));
    const sumas = this.roundAmount(totalAntesRet - iva);
    const descuentos = 0;
    const totalOperacion = this.roundAmount(sumas - descuentos);
    const subTotalVentas = this.roundAmount(totalOperacion + iva);
    const retencion = retencionMonto !== undefined
      ? this.roundAmount(retencionMonto)
      : this.roundAmount(sumas * this.resolveRetencionFactor(retencionCode));
    const totalFactura = this.roundAmount(subTotalVentas - retencion);

    return { sumas, descuentos, totalOperacion, iva, subTotalVentas, retencion, totalFactura };
  }

  private refreshFacturaTotales() {
    const idFactura = this.toNumber(this.facForm.controls.IdFactura.value);
    if (idFactura <= 0) {
      return;
    }

    if (this.facturaTotalesRequestInFlightForId === idFactura) {
      return;
    }

    this.facturaTotalesRequestInFlightForId = idFactura;
    this.loadingTotals.set(true);
    this.facturacionService.getFacturaTotales(idFactura).pipe(
      finalize(() => {
        if (this.facturaTotalesRequestInFlightForId === idFactura) {
          this.facturaTotalesRequestInFlightForId = null;
        }
        this.loadingTotals.set(false);
        this.cdr.markForCheck();
      })
    ).subscribe({
      next: (totales) => {
        this.patchFacturaTotales(totales);
      },
      error: () => {
        const totals = this.computeTotalsFromDetalleRows(this.detalleRows(), this.facForm.controls.RetencionIvaCodigo.value);
        this.facForm.patchValue({
          Sumas: totals.sumas,
          Descuentos: totals.descuentos,
          TotalOperacion: totals.totalOperacion,
          SubTotalVentas: totals.subTotalVentas,
          TotalImpuesto1: totals.iva,
          IvaRetenido: totals.retencion,
          TotalFactura: totals.totalFactura
        });
        this.cdr.markForCheck();
      }
    });
  }

  private patchFacturaTotales(totales: FacturaTotalesDto) {
    const descuentos = this.resolveDescuentosFromTotales(totales);
    const normalized = this.normalizeFacturaTotales({
      sumas: this.toNumber(totales.SUMAS),
      descuentos,
      totalOperacion: this.toNumber(totales.TotalOperacion),
      iva: this.toNumber(totales.TOTAL_IMPUESTO1),
      subTotalVentas: this.toNumber(totales.SubTotalVentas),
      retencion: this.toNumber(totales.RETENCION),
      totalFactura: this.toNumber(totales.TOTAL_FACTURA)
    });

    this.facForm.patchValue({
      Sumas: normalized.sumas,
      Descuentos: normalized.descuentos,
      TotalOperacion: normalized.totalOperacion,
      SubTotalVentas: normalized.subTotalVentas,
      TotalImpuesto1: normalized.iva,
      IvaRetenido: normalized.retencion,
      TotalFactura: normalized.totalFactura,
      IncluyeIVA: !!totales.PrecioConIVA
    });
    this.cdr.markForCheck();
  }

  private resolveDescuentosFromTotales(totales: FacturaTotalesDto): number {
    const candidates = [totales.DescuentoTotal, totales.DescuentoAdicional, totales.DESCUENTO];
    const explicit = candidates.map((value) => this.roundAmount(value)).find((value) => value > 0);
    if (explicit !== undefined) {
      return explicit;
    }

    return this.roundAmount(Math.max(this.toNumber(totales.SUMAS) - this.toNumber(totales.TotalOperacion), 0));
  }

  private resolveDescuentosFromEncabezado(encabezado: FacturaEncabezadoDto): number {
    const explicit = this.roundAmount(encabezado.DescuentoAdicional);
    if (explicit > 0) {
      return explicit;
    }

    return this.roundAmount(Math.max(this.toNumber(encabezado.Sumas) - this.toNumber(encabezado.TotalOperacion), 0));
  }

  private normalizeFacturaTotales(source: {
    sumas: number;
    descuentos: number;
    totalOperacion: number;
    iva: number;
    subTotalVentas: number;
    retencion: number;
    totalFactura: number;
  }): { sumas: number; descuentos: number; totalOperacion: number; iva: number; subTotalVentas: number; retencion: number; totalFactura: number } {
    const sumas = this.roundAmount(source.sumas);
    const descuentos = this.roundAmount(Math.max(source.descuentos, 0));
    const totalOperacionBase = this.roundAmount(source.totalOperacion);
    const totalOperacion = totalOperacionBase > 0 || sumas === 0
      ? totalOperacionBase
      : this.roundAmount(sumas - descuentos);
    const iva = this.roundAmount(source.iva);
    const subTotalVentasBase = this.roundAmount(source.subTotalVentas);
    const subTotalVentas = subTotalVentasBase > 0 || (totalOperacion === 0 && iva === 0)
      ? subTotalVentasBase
      : this.roundAmount(totalOperacion + iva);
    const retencion = this.roundAmount(source.retencion);
    const totalFacturaBase = this.roundAmount(source.totalFactura);
    const totalFactura = totalFacturaBase > 0 || (subTotalVentas === 0 && retencion === 0)
      ? totalFacturaBase
      : this.roundAmount(subTotalVentas - retencion);

    return { sumas, descuentos, totalOperacion, iva, subTotalVentas, retencion, totalFactura };
  }

  private roundAmount(value: unknown): number {
    return Number(this.toNumber(value).toFixed(2));
  }

  private resolveRetencionFactor(retencionCode: string | null | undefined): number {
    const code = String(retencionCode ?? '').trim();
    if (!code) {
      return 0;
    }

    const selected = this.retencionesOptions().find((item) => String(item.RETENCION ?? '').trim() === code);
    const source = `${selected?.DESCRIPCION ?? ''} ${selected?.RETENCION ?? ''}`;
    const match = source.match(/(\d+(?:[\.,]\d+)?)\s*%/);
    if (!match) {
      return 0;
    }

    const parsed = Number(String(match[1] ?? '').replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 0;
    }

    return parsed / 100;
  }

  private loadInitial() {
    const usuario = this.authService.currentUser()?.username ?? '';
    this.facturacionService.getSucursalPuntoVendedor(usuario).subscribe({
      next: (rows) => { this.sucursalPuntoRows.set(rows ?? []); this.applyDefaultSucursalPunto(); },
      error: () => this.sucursalPuntoRows.set([])
    });
    this.facturacionService.getPerfilClientes().subscribe({
      next: (rows) => {
        const profiles = rows ?? [];
        this.perfilClientes.set(profiles);
        const clientes = Array.from(new Set(profiles.map((item) => String(item.NOMBRE ?? '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
        this.clientesOptions.set(clientes);
        this.clienteSuggestions.set([...clientes]);
      },
      error: () => { this.perfilClientes.set([]); this.clientesOptions.set([]); this.clienteSuggestions.set([]); }
    });
    // Siempre forzar catálogo actualizado
    this.facturacionService.getArticulosPorBodega('BOD01').subscribe({
      next: (rows) => {
        const sourceItems = rows ?? [];
        const items = this.simulateLargeCatalog(sourceItems);
        this.articulosOptions.set(items);
        this.articuloSuggestions.set(items.map((item) => this.toArticuloDisplay(item)));
        this.articuloVisibleLimit.set(this.articuloChunkSize);
        this.ensureVisibleArticuloImages();
      },
      error: () => {
        this.articulosOptions.set([]);
        this.articuloSuggestions.set([]);
        this.clearArticuloImageUrls();
      }
    });
    this.facturacionService.getFormasPago().subscribe({
      next: (rows) => {
        this.formasPagoOptions.set((rows ?? []).filter((item) => !!String(item.Codigo ?? '').trim()));
        this.applyDefaultFormaPago();
      },
      error: () => this.formasPagoOptions.set([])
    });
    this.facturacionService.getCatalogoRetenciones().subscribe({
      next: (rows) => this.retencionesOptions.set((rows ?? []).filter((item) => !!String(item.RETENCION ?? '').trim())),
      error: () => this.retencionesOptions.set([])
    });
    this.facturacionService.getCatalogoCondicionPago().subscribe({
      next: (rows) => this.condicionesPagoOptions.set(rows ?? []),
      error: () => this.condicionesPagoOptions.set([])
    });
    this.loadMaestro();
    this.openCreate();
  }

  private patchEncabezado(encabezado: FacturaEncabezadoDto) {
    const prefijo = String(encabezado.Prefijo ?? '').trim();
    const factura = String(encabezado.Factura ?? '').trim();
    const codigoGeneracion = `${prefijo}${factura}`.trim();
    const loadedProfile = this.perfilClientes().find(
      (p) => String(p.CLIENTE ?? '').trim() === String(encabezado.Cliente ?? '').trim()
    );
    const isAnonimo = String(loadedProfile?.NOMBRE ?? '').trim().toLowerCase() === 'sr(a)';
    const clienteDisplay = this.resolveClienteDisplayValue(encabezado, loadedProfile);
    this.isAnonimoClient.set(isAnonimo);
    const descuentos = this.resolveDescuentosFromEncabezado(encabezado);
    const normalizedTotals = this.normalizeFacturaTotales({
      sumas: encabezado.Sumas,
      descuentos,
      totalOperacion: encabezado.TotalOperacion,
      iva: encabezado.TotalImpuesto1,
      subTotalVentas: encabezado.SubTotalVentas,
      retencion: encabezado.Retencion,
      totalFactura: encabezado.TotalFactura
    });

    this.facForm.patchValue({
      IdFactura: encabezado.IdFactura, Estado: encabezado.Estado,
      Fecha: this.formatDateInput(encabezado.Fecha), Sucursal: encabezado.Sucursal,
      PuntoVenta: encabezado.PuntoVenta,
      Cliente: encabezado.Cliente,
      FacturarA: isAnonimo ? (loadedProfile?.NOMBRE || 'Sr(a)') : clienteDisplay,
      NombreFacturarA: isAnonimo ? (encabezado.FacturarA || 'Sr(a)') : '',
      Nombre: encabezado.Nombre, NIT: encabezado.NIT, Identificacion: encabezado.Identificacion,
      RegistroComercio: encabezado.RegistroComercio, Giro: encabezado.Giro,
      CorreoElectronico: encabezado.CorreoElectronico, Pais: encabezado.Pais,
      Departamento: encabezado.Departamento, Municipio: encabezado.Municipio, Direccion: encabezado.Direccion,
      IncluyeIVA: true, RetencionIvaCodigo: '', IvaRetenido: this.toNumber(encabezado.Retencion),
      CondicionPago: String(encabezado.CondicionPago ?? '').trim() || 'CONTADO', Vendedor: encabezado.Vendedor,
      FormaPagoCodigo: '', FormaPagoMonto: 0, Observaciones: encabezado.Observaciones,
      Sumas: normalizedTotals.sumas,
      Descuentos: normalizedTotals.descuentos,
      TotalOperacion: normalizedTotals.totalOperacion,
      TotalFactura: normalizedTotals.totalFactura, SubTotalVentas: normalizedTotals.subTotalVentas,
      TotalImpuesto1: normalizedTotals.iva,
      CodGeneracion: codigoGeneracion || encabezado.CodGeneracion || this.generateCodigoGeneracion(),
      NoControl: encabezado.NoControl || '', SelloRecepcion: encabezado.SelloRecepcion || '',
      IdDTE: encabezado.IdDTE
    });
    this.blockEmissionFields();
    this.tipoFacturaActual.set(this.normalizeTipoFactura(encabezado.TipoFactura));
    this.selectedSucursal.set(encabezado.Sucursal || '');
    this.formasPagoDetalle.set([]);
    this.retencionAplicada.set(null);
    this.syncClienteSuggestions(clienteDisplay);
    this.syncDisabledControls();
  }

  private resolveClienteDisplayValue(encabezado: FacturaEncabezadoDto, profile?: PerfilClienteDto): string {
    const facturarA = String(encabezado.FacturarA ?? '').trim();
    if (facturarA) {
      return facturarA;
    }

    const profileNombre = String(profile?.NOMBRE ?? '').trim();
    if (profileNombre) {
      return profileNombre;
    }

    const nombre = String(encabezado.Nombre ?? '').trim();
    if (nombre) {
      return nombre;
    }

    return String(encabezado.Cliente ?? '').trim();
  }

  private syncClienteSuggestions(currentValue?: string) {
    const options = [...this.clientesOptions()];
    const selectedValue = String(currentValue ?? this.facForm.controls.FacturarA.value ?? '').trim();
    if (!selectedValue) {
      this.clienteSuggestions.set(options);
      return;
    }

    const exists = options.some((item) => item.toLowerCase() === selectedValue.toLowerCase());
    this.clienteSuggestions.set(exists ? options : [selectedValue, ...options]);
  }

  private refreshEncabezadoAfterEmission(_showToastOnError: boolean = true): Observable<FacturaEncabezadoDto> {
    const selected = this.selectedFactura();
    const raw = this.facForm.getRawValue();
    const idEmpresa = this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0;
    
    let prefijo = selected?.Prefijo || '';
    let factura = selected?.Factura || '';
    
    // Si prefijo/factura no disponibles, extraer de CodGeneracion
    if (!prefijo && !factura) {
      const codGeneracion = String(raw.CodGeneracion ?? '').trim();
      if (codGeneracion && codGeneracion.length >= 36) {
        prefijo = codGeneracion.substring(0, 18);
        factura = codGeneracion.substring(18, 36);
      }
    }
    
    return this.facturacionService.getFacturaEncabezado(
      prefijo,
      factura,
      selected?.CODIGOSUCURSAL || selected?.SUCURSAL || raw.Sucursal || '',
      selected?.PUNTO_VENTA || raw.PuntoVenta || '', idEmpresa
    ).pipe(
      map((encabezado) => {
        this.patchEncabezado(encabezado);
        this.loadFacturaFormaPago(this.toNumber(encabezado.IdFactura));
        return encabezado;
      }),
      finalize(() => this.blockEmissionFields())
    );
  }

  private buildUpdateFacturaPayload(): UpdateFacturaDto {
    const raw = this.facForm.getRawValue();
    const username = String(this.authService.currentUser()?.username ?? '').trim();
    return {
      CodGeneracion: String(raw.CodGeneracion ?? '').trim(),
      Sucursal: String(raw.Sucursal ?? '').trim(), PuntoVenta: String(raw.PuntoVenta ?? '').trim(),
      TipoVenta: 'G',
      Cliente: String(raw.Cliente ?? '').trim(),
      FacturarA: this.isAnonimoClient()
        ? String(raw.NombreFacturarA ?? '').trim() || 'Sr(a)'
        : String(raw.FacturarA ?? '').trim(),
      Fecha: this.ensureDate(raw.Fecha), CondicionPago: String(raw.CondicionPago ?? 'CONTADO').trim(),
      Vendedor: String(raw.Vendedor ?? '').trim() || username, Observaciones: String(raw.Observaciones ?? '').trim(),
      Usuario: username, TipoMtto: this.resolveTipoMtto(), Contabilizar: 0,
      SubTotal: this.toNumber(raw.TotalOperacion), IVA: this.toNumber(raw.TotalImpuesto1),
      Impuesto2: 0, Impuesto3: 0, Retencion: this.toNumber(raw.IvaRetenido),
      NIT: String(raw.NIT ?? '').trim(), RegistroComercio: String(raw.RegistroComercio ?? '').trim(),
      NumeroResolucion: '', ExistenciaFecDoc: 0, NumeroControl: String(raw.NoControl ?? '').trim(),
      SelloRecepcion: String(raw.SelloRecepcion ?? '').trim(), JSON: JSON.stringify(this.facJsonPreview()),
      IdCondicionTraslado: '', NombreEntrega: '', IdentificacionEntrega: '', NombreRecibe: '',
      IdentificacionRecibe: '', TipoDestinoRemision: '', Proveedor: '', IdModoTransporte: 0,
      NombreConductor: '', NumeroConductor: '', PlacaTransporte: '', IdRecintoFiscal: 0,
      IdIncoterm: 0, IdRegimenExportacion: 0, PrecioConIVA: raw.IncluyeIVA ? 1 : 0,
      Flete: 0, Seguro: 0, DescuentoAdicional: this.toNumber(raw.Descuentos), DTE: this.toNumber(raw.IdDTE),
      CorreoCliente: String(raw.CorreoElectronico ?? '').trim(),
      TipoFactura: this.normalizeTipoFactura(this.tipoFacturaActual())
    };
  }

  private buildUpdateFacturaRetencionPayload(retencionCodigo: string): UpdateFacturaRetencionDto {
    const raw = this.facForm.getRawValue();
    const username = String(this.authService.currentUser()?.username ?? '').trim();
    const tipoFactura = this.getCurrentTipoFactura();
    const isSinRetencion = !retencionCodigo;
    const retencionFactura = isSinRetencion ? 0 : this.toNumber(raw.IvaRetenido);

    return {
      CodGeneracion: String(raw.CodGeneracion ?? '').trim(),
      Sucursal: String(raw.Sucursal ?? '').trim(),
      PuntoVenta: String(raw.PuntoVenta ?? '').trim(),
      TipoFactura: tipoFactura,
      Retencion: retencionCodigo,
      Monto: retencionFactura,
      TipoMtto: isSinRetencion ? 'B' : 'A',
      Usuario: username,
      SubTotal: this.toNumber(raw.TotalOperacion),
      IVA: this.toNumber(raw.TotalImpuesto1),
      Impuesto2: 0,
      Impuesto3: 0,
      RetencionFactura: retencionFactura
    };
  }

  onIncluyeIvaChange(checked: boolean): void {
    const idFactura = this.toNumber(this.facForm.controls.IdFactura.value);
    if (!idFactura) {
      return;
    }
    this.facturacionService.updatePrecioConIva(idFactura, checked).subscribe({
      error: (error) => {
        this.showError('FAC POS', this.extractError(error, 'No se pudo actualizar PrecioConIVA.'));
      }
    });
  }

  private updateFacturaRetencion(retencionCodigo: string) {
    const payload = this.buildUpdateFacturaRetencionPayload(retencionCodigo);
    this.facturacionService.updateFacturaRetencion(payload).subscribe({
      next: () => {
        this.refreshRetencionAplicadaFromBackend();
      },
      error: (error) => {
        this.showError('FAC POS', this.extractError(error, 'No se pudo actualizar la retención.'));
      }
    });
  }

  private resolveRetencionDescripcion(retencionCodigo: string): string {
    const code = String(retencionCodigo ?? '').trim();
    if (!code) {
      return '';
    }

    const item = this.retencionesOptions().find((entry) => String(entry.RETENCION ?? '').trim() === code);
    return String(item?.DESCRIPCION ?? code).trim();
  }

  resolveCondicionPagoLabel(codigo: string | null): string {
    const code = String(codigo ?? '').trim();
    if (!code) return 'Contado';
    const item = this.condicionesPagoOptions().find(
      (c) => String(c.CONDICION_PAGO ?? '').trim() === code
    );
    return String(item?.DESCRIPCION ?? code).trim() || 'Contado';
  }

  private buildUpdateDetalleFacturaPayload(
    detail: FacturaDetalleDto,
    totals: { totalOperacion: number; iva: number; retencion: number },
    tipoMtto: 'A' | 'B' = 'A'
  ): UpdateDetalleFacturaDto {
    const raw = this.facForm.getRawValue();
    const username = String(this.authService.currentUser()?.username ?? '').trim();
    const tipoFactura = this.getCurrentTipoFactura();

    return {
      CodGeneracion: String(raw.CodGeneracion ?? '').trim(),
      Sucursal: String(raw.Sucursal ?? '').trim(),
      PuntoVenta: String(raw.PuntoVenta ?? '').trim(),
      TipoFactura: tipoFactura,
      Cantidad: this.toNumber(detail.CANTIDAD),
      Articulo: String(detail.ARTICULO ?? '').trim(),
      Descripcion: String(detail.DESCRIPCION ?? '').trim(),
      PrecioUnitario: this.toNumber(detail.PRECIO_UNITARIO),
      CostoUnitario: this.toNumber(detail.COSTO_UNITARIO),
      Calidad: String(detail.CALIDAD ?? '').trim(),
      Bodega: String(detail.BODEGA ?? '').trim(),
      UnidadMedida: String(detail.UNIDAD_MEDIDA ?? '').trim(),
      Usuario: username,
      TipoMtto: tipoMtto,
      Linea: tipoMtto === 'A' ? 0 : this.toNumber(detail.LINEA),
      SubTotal: totals.totalOperacion,
      IVA: totals.iva,
      Impuesto2: 0,
      Impuesto3: 0,
      Retencion: totals.retencion,
      TipoColor: String(detail.TIPO_COLOR ?? '').trim() || 'NA',
      CantidadConversion: this.toNumber(detail.CANTIDAD_KARDEX || detail.CANTIDAD),
      UnidadMedidaConversion: String(detail.UNIDAD_MEDIDA_KARDEX ?? '').trim(),
      IdColor: this.toNumber(detail.ID_COLOR),
      IdAcabado: String(detail.IdAcabado ?? '').trim()
    };
  }

  private resolveTipoMtto(): string {
    return (!!this.selectedFactura() || this.toNumber(this.facForm.controls.IdFactura.value) > 0 || this.hasSavedCurrentRecord()) ? 'C' : 'A';
  }

  private applyDefaultSucursalPunto() {
    if (String(this.facForm.controls.Sucursal.value ?? '').trim()) return;
    const sucursales = this.sucursalOptions();
    if (!sucursales.length) return;
    const firstSucursal = sucursales[0].value;
    this.selectedSucursal.set(firstSucursal);
    this.facForm.patchValue({ Sucursal: firstSucursal });
    const puntos = this.puntoVentaOptions();
    if (puntos.length) this.facForm.patchValue({ PuntoVenta: puntos[0].value });
  }

  private applyDefaultFormaPago() {
    const current = String(this.facForm.controls.FormaPagoCodigo.value ?? '').trim();
    const options = this.formasPagoOptions();
    if (!options.length) return;
    if (current && options.some((item) => String(item.Codigo ?? '').trim() === current)) return;
    const firstCode = String(options[0].Codigo ?? '').trim();
    if (firstCode) this.facForm.patchValue({ FormaPagoCodigo: firstCode });
  }

  private toArticuloDisplay(item: ArticuloPorBodegaDto): string {
    return `${String(item.ARTICULO ?? '').trim()} - ${String(item.DESCRIPCION ?? '').trim()}`;
  }

  private findArticuloByDisplay(displayValue: string): ArticuloPorBodegaDto | undefined {
    const normalized = displayValue.toLowerCase();
    if (!normalized) return undefined;
    return this.articulosOptions().find((item) => {
      const display = this.toArticuloDisplay(item).toLowerCase();
      return display === normalized || String(item.ARTICULO ?? '').toLowerCase() === normalized;
    });
  }

  private blockEmissionFields() {
    this.facForm.controls.CodGeneracion.disable({ emitEvent: false });
    this.facForm.controls.NoControl.disable({ emitEvent: false });
    this.facForm.controls.SelloRecepcion.disable({ emitEvent: false });
  }

  private syncDisabledControls() {
    const readOnly = this.isReadOnlyField();
    const disableFormaPagoCodigo = readOnly || this.isNewUnsaved() || !this.cobroDialogVisible();

    this.toggleControlDisabled(this.facForm.controls.IncluyeIVA, readOnly);
    this.toggleControlDisabled(this.facForm.controls.Sucursal, readOnly);
    this.toggleControlDisabled(this.facForm.controls.PuntoVenta, readOnly);
    this.toggleControlDisabled(this.facForm.controls.CondicionPago, readOnly);
    this.toggleControlDisabled(this.facForm.controls.FormaPagoCodigo, disableFormaPagoCodigo);
  }

  private toggleControlDisabled(control: { disabled: boolean; disable: (opts?: { emitEvent?: boolean }) => void; enable: (opts?: { emitEvent?: boolean }) => void }, disabled: boolean) {
    if (disabled && !control.disabled) {
      control.disable({ emitEvent: false });
      return;
    }

    if (!disabled && control.disabled) {
      control.enable({ emitEvent: false });
    }
  }

  private resolveCodigoSucursalMh(sucursal: string, puntoVenta: string): string {
    return this.sucursalPuntoRows().find((r) => r.Sucursal === sucursal && r.PUNTO_VENTA === puntoVenta)?.CodigoMHSC || sucursal || 'M001';
  }

  private resolveCodigoPuntoMh(sucursal: string, puntoVenta: string): string {
    return this.sucursalPuntoRows().find((r) => r.Sucursal === sucursal && r.PUNTO_VENTA === puntoVenta)?.codigoMHPV || puntoVenta || 'P001';
  }

  private resolveUnidad(_unidad: string): number { return 59; }

  private calcIvaItem(item: FacturaDetalleDto): number {
    return Number((this.toNumber(item.TotalVenta || item.TOTAL) * 0.12).toFixed(2));
  }

  ngOnDestroy(): void {
    this.stopScanner();
    this.clearArticuloImageUrls();
  }

  private generateCodigoGeneracion(): string { return crypto.randomUUID().toUpperCase(); }

  private getAmbiente(): string {
    return Number(this.authService.currentUser()?.selectedEmpresa?.ambienteEmision) === 0 ? '00' : '01';
  }

  private openPanel() {
    this.emisionPanelOpen.set(true);
    this.emisionSteps.set([
      { key: 'service', label: 'Verificando servicio', status: 'pending' },
      { key: 'sequence', label: 'Verificando secuencia', status: 'pending' },
      { key: 'verify', label: 'Validando documento', status: 'pending' },
      { key: 'emit', label: 'Emitiendo DTE', status: 'pending' },
      { key: 'sync', label: 'Sincronizando datos', status: 'pending' },
      { key: 'correo', label: 'Correo y formato visual', status: 'pending' }
    ]);
  }

  private isEmpresaAutorizadaEmiteDte(): boolean {
    const empresa = this.authService.currentUser()?.selectedEmpresa as Record<string, unknown> | null | undefined;
    const flag = empresa?.['emiteDTE'] ?? empresa?.['EmiteDTE'];
    if (flag === undefined || flag === null || flag === '') {
      return true;
    }
    const normalized = String(flag).trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'si' || normalized === 'sí';
  }

  private resolveTipoDocMh(tipoFactura: string): string {
    const tipo = String(tipoFactura ?? '').trim().toUpperCase();
    const mapTipoDoc: Record<string, string> = {
      FAC: '01',
      CCF: '03',
      NR: '04',
      NC: '05',
      ND: '06',
      CR: '07',
      FEX: '11',
      SE: '14',
      CD: '15'
    };
    return mapTipoDoc[tipo] ?? '00';
  }

  private buildSecuenciaName(tipoFactura: string, idEmpresa: number, ambiente: string): string {
    const tipo = String(tipoFactura ?? '').trim().toUpperCase();
    const tipoSeq = tipo === 'FAC' ? 'CF' : tipo;
    const ambienteSuffix = ambiente === '01' ? '' : '0';
    return `SeqDTE${idEmpresa}${ambienteSuffix}${tipoSeq}`;
  }

  private normalizeDteVisualHtml(rawHtml: string): string {
    const text = String(rawHtml ?? '').trim();
    if (!text) {
      return '';
    }

    try {
      const parsed = JSON.parse(text);
      if (typeof parsed === 'string') {
        return parsed;
      }
    } catch {
      // ignore
    }

    return text;
  }

  private openPreviewUrlWithFallback(emitido: boolean) {
    const idFactura = this.toNumber(this.facForm.controls.IdFactura.value);
    const idEmpresa = this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0;
    const tipoFactura = this.getCurrentTipoFactura();

    if (!idFactura || !idEmpresa) {
      this.showError('FAC POS', 'No se pudo construir la vista previa del documento.');
      return;
    }

    const previewUrl = this.facturacionService.getPreviewDteUrl(idEmpresa, idFactura, tipoFactura, emitido);

    this.previewLoading.set(true);
    const popup = window.open(previewUrl, '_blank', 'noopener,noreferrer');
    this.previewLoading.set(false);

    if (!popup) {
      this.showError('FAC POS', 'El navegador bloqueó la vista previa. Asegúrese de permitir ventanas emergentes.');
    }
  }

  private openDteVisualPreview(htmlCompleto: string) {
    const popup = window.open('', '_blank');
    if (!popup) {
      this.showError('FAC POS', 'El navegador bloqueó la vista visual del DTE.');
      return;
    }

    const toolbarHtml = `
      <div id="printToolbar" style="width:100%; text-align:center; padding:15px 0; background:#f8f9fa; border-bottom:1px solid #dee2e6; margin-bottom:20px; font-family:sans-serif;">
        <button onclick="window.print()" style="padding:12px 25px; background:#023c8d; color:white; border:none; border-radius:6px; cursor:pointer; font-size:14px; font-weight:bold; box-shadow:0 2px 4px rgba(0,0,0,0.1);">
          📥 Descargar / Imprimir PDF
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

  private setStep(key: string, status: EmisionStep['status'], detail?: string) {
    this.emisionSteps.update((steps) => steps.map((step) => (step.key === key ? { ...step, status, detail } : step)));
  }

  private showInfo(summary: string, detail: string) { this.messageService.add({ severity: 'info', summary, detail }); }
  private showError(summary: string, detail: string) { this.messageService.add({ severity: 'error', summary, detail }); }
  private showWarn(summary: string, detail: string) { this.messageService.add({ severity: 'warn', summary, detail }); }

  private patchIdFacturaFromUpdateResponse(response: unknown) {
    if (!response || typeof response !== 'object') {
      return;
    }

    const raw = response as Record<string, unknown>;
    const idFactura = this.toNumber(raw['idFactura'] ?? raw['IdFactura'] ?? raw['IDFACTURA']);

    if (idFactura > 0) {
      this.facForm.patchValue({ IdFactura: idFactura });
    }
  }

  private extractIdFacturaNuevo(response: unknown): number {
    if (!response || typeof response !== 'object') {
      return 0;
    }

    const raw = response as Record<string, unknown>;
    return this.toNumber(raw['idFacturaNuevo'] ?? raw['IdFacturaNuevo'] ?? raw['IDFACTURANUEVO']);
  }

  private extractError(error: unknown, fallback: string): string {
    if (typeof error === 'string') return this.sanitizeBackendErrorMessage(error) || fallback;
    const maybe = error as { error?: unknown; message?: string };
    const fromError = maybe?.error;
    if (typeof fromError === 'string' && fromError.trim()) return this.sanitizeBackendErrorMessage(fromError) || fallback;

    if (fromError && typeof fromError === 'object') {
      const errorObject = fromError as Record<string, unknown>;
      const candidates = [errorObject['message'], errorObject['detail'], errorObject['title']];

      for (const candidate of candidates) {
        if (typeof candidate !== 'string' || !candidate.trim()) {
          continue;
        }

        const sanitized = this.sanitizeBackendErrorMessage(candidate);
        if (sanitized) {
          return sanitized;
        }
      }
    }

    if (typeof maybe?.message === 'string' && maybe.message.trim()) return this.sanitizeBackendErrorMessage(maybe.message) || fallback;
    return fallback;
  }

  private sanitizeBackendErrorMessage(message: string): string {
    const normalized = String(message ?? '').replace(/\r/g, '\n').trim();
    if (!normalized) {
      return '';
    }

    if (/The conversion of a nvarchar data type to a datetime data type resulted in an out-of-range value\.?/i.test(normalized)) {
      return '';
    }

    const sqlMatch = normalized.match(/SqlException\s*\([^)]*\)\s*:\s*([^\n]+)/i);
    if (sqlMatch?.[1]) {
      const sqlMessage = String(sqlMatch[1]).trim();
      if (/The conversion of a nvarchar data type to a datetime data type resulted in an out-of-range value\.?/i.test(sqlMessage)) {
        return '';
      }
      return sqlMessage;
    }

    const firstMeaningfulLine = normalized
      .split('\n')
      .map((line) => line.trim())
      .find((line) => !!line && !/^at\s+/i.test(line) && !/^--- End of stack trace/i.test(line));

    if (!firstMeaningfulLine) {
      return '';
    }

    const exceptionMessageMatch = firstMeaningfulLine.match(/Exception[^:]*:\s*(.+)$/i);
    return String(exceptionMessageMatch?.[1] ?? firstMeaningfulLine).trim();
  }

  private buildFacturacionAplicacionPayload(tipoMtto: 'Aplicar' | 'Desaplicar'): UpdateFacturacionAplicacionDto {
    const raw = this.facForm.getRawValue();
    return {
      CodGeneracion: String(raw.CodGeneracion ?? '').trim(),
      Sucursal: String(raw.Sucursal ?? '').trim(),
      PuntoVenta: String(raw.PuntoVenta ?? '').trim(),
      TipoFactura: this.getCurrentTipoFactura(),
      Usuario: String(this.authService.currentUser()?.username ?? '').trim(),
      IdEmpresa: this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0,
      TipoMtto: tipoMtto
    };
  }

  private getCurrentTipoFactura(): 'FAC' | 'CCF' {
    return this.normalizeTipoFactura(this.selectedFactura()?.Tipo_Factura || this.tipoFacturaActual());
  }

  private normalizeTipoFactura(tipoFactura: unknown): 'FAC' | 'CCF' {
    return String(tipoFactura ?? '').trim().toUpperCase() === 'CCF' ? 'CCF' : 'FAC';
  }

  private executeDesaplicarFromCobro() {
    const payload = this.buildFacturacionAplicacionPayload('Desaplicar');
    return this.facturacionService.updateFacturacionAplicacion(payload);
  }

  private shouldRetryDeleteAfterDesaplicar(error: unknown): boolean {
    const message = this.extractError(error, '').toLowerCase();
    return message.includes('factura esta aplicada no se puede modificar o eliminar');
  }

  private ensureDate(value: string | null | undefined): string {
    const text = String(value ?? '').trim();
    return text || this.formatDateInput(new Date());
  }

  private isValidFilterDate(value: string): boolean {
    return this.normalizeFilterDate(value) !== null;
  }

  private normalizeFilterDate(value: unknown): string | null {
    const text = String(value ?? '').trim();
    if (!text) {
      return null;
    }

    const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      return this.buildValidatedIsoDate(isoMatch[1], isoMatch[2], isoMatch[3]);
    }

    const slashMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (slashMatch) {
      return this.buildValidatedIsoDate(slashMatch[3], slashMatch[2], slashMatch[1]);
    }

    return null;
  }

  private buildValidatedIsoDate(yearText: string, monthText: string, dayText: string): string | null {
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);

    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
      return null;
    }

    const candidate = new Date(year, month - 1, day);
    if (
      Number.isNaN(candidate.getTime()) ||
      candidate.getFullYear() !== year ||
      candidate.getMonth() !== month - 1 ||
      candidate.getDate() !== day
    ) {
      return null;
    }

    return `${yearText}-${monthText}-${dayText}`;
  }

  private currentTime(): string {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  }

  private formatDateInput(value: Date | string): string {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return this.formatDateInput(new Date());
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  private startOfMonth(date: Date): Date { return new Date(date.getFullYear(), date.getMonth(), 1); }

  private toNumber(value: unknown): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private numberToSimpleWords(amount: number): string {
    return `${amount.toFixed(2)} USD`;
  }
  private refreshDetalleYTotales() {
    const raw = this.facForm.getRawValue();
    const selected = this.selectedFactura();
    let prefijo = selected?.Prefijo || '';
    let factura = selected?.Factura || '';
    
    // Si no hay prefijo en la factura seleccionada, lo extraemos del código de generación actual
    if (!prefijo && !factura) {
      const codGeneracion = String(raw.CodGeneracion ?? '').trim();
      if (codGeneracion && codGeneracion.length >= 36) {
        prefijo = codGeneracion.substring(0, 18);
        factura = codGeneracion.substring(18, 36);
      }
    }

    const sucursal = String(selected?.CODIGOSUCURSAL || selected?.SUCURSAL || raw.Sucursal || '').trim();
    const puntoVenta = String(selected?.PUNTO_VENTA || raw.PuntoVenta || '').trim();
    const tipoFactura = this.getCurrentTipoFactura();

    if (!prefijo || !factura) return;

    this.loadingDetail.set(true);
    this.facturacionService.getFacturaDetalle(prefijo, factura, sucursal, puntoVenta, tipoFactura)
      .pipe(finalize(() => {
        this.loadingDetail.set(false);
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (detalle) => {
          this.detalleRows.set(detalle ?? []);
          // Al llamar syncTotalsFromDetalle, como hasSavedCurrentRecord es true, 
          // también se disparará automáticamente this.refreshFacturaTotales() 
          // trayendo los totales correctos desde el backend.
          this.syncTotalsFromDetalle(); 
        },
        error: (error) => {
          this.showError('FAC POS', this.extractError(error, 'No se pudo recargar el detalle actualizado.'));
        }
      });
  }
  // Recibo informal: usado cuando la empresa no emite DTE, y también (ambiente de pruebas) para
  // FAC registradas sin contactar Hacienda. El formato vive en ReciboService (compartido con fac.ts).
  private imprimirTicketInformal() {
    const datos = this.buildReciboDatosDesdeForm();
    const ok = this.reciboService.imprimirRecibo(datos);
    if (!ok) {
      this.showError('FAC POS', 'El navegador bloqueó la vista de la factura. Asegúrese de permitir ventanas emergentes.');
    }
  }
}
