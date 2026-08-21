import { ChangeDetectionStrategy, ChangeDetectorRef, Component, PLATFORM_ID, ViewChild, computed, inject, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, catchError, finalize, forkJoin, map, of, switchMap, timeout, timer } from 'rxjs';

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
  CondicionPagoCatalogoDto,
  DatosDestinatarioDteDto,
  ParametrosDteAnulacionDto,
  EmisionStep,
  FacturaDetalleDto,
  FacturaEncabezadoDto,
  FacturaFormaPagoDto,
  FacturaGeneralDto,
  FacturaRetencionDto,
  FacturaTotalesDto,
  FormaPagoDto,
  DeleteFacturaDto,
  PerfilClienteDto,
  ParametrosDteDto,
  RespuestaDteDto,
  RetencionCatalogoDto,
  SucursalPuntoVendedorDto,
  UpdateDetalleFacturaDto,
  UpdateFacturacionAplicacionDto,
  UpdateFacturaDto,
  UpdateFacturaFormaPagoDto,
  UpdateFacturaRetencionDto
} from '../../../core/models/facturacion.models';
import { environment } from '../../../../environments/environment';
import { getTipoFacturaDescripcion } from '../../../shared/utils/tipo-factura';
import { FacturacionService } from '../services/facturacion';
import { ReciboService, ReciboDatos } from '../services/recibo';
import { ArticulosLazyService } from '../services/articulos-lazy.service';
import { ReenviarCorreoDialogComponent } from '../../../shared/components/reenviar-correo-dialog/reenviar-correo-dialog';
import { EliminarConfirmDialogComponent } from '../../../shared/components/eliminar-confirm-dialog/eliminar-confirm-dialog';

function toIsoDateStr(raw: any): string {
  if (!raw) return '';
  const str = String(raw).trim();
  if (!str) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10);
  const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return '';
}

@Component({
  selector: 'app-fac',
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
  templateUrl: './fac.html',
  styleUrls: ['./fac.scss']
})
export class FacComponent {
  // Emisión normal ~4–8s. Tope con margen; si se agota, se reconcilia por si el documento ya se
  // emitió aunque se perdiera la respuesta por red inestable.
  private static readonly EMIT_TIMEOUT_MS = 15000;
  private static readonly RECONCILE_INTERVAL_MS = 3000;
  private static readonly RECONCILE_MAX_INTENTOS = 3;

  @ViewChild(ReenviarCorreoDialogComponent) reenviarCorreoDialog!: ReenviarCorreoDialogComponent;
  @ViewChild(EliminarConfirmDialogComponent) eliminarConfirmDialog!: EliminarConfirmDialogComponent;

  private fb = inject(FormBuilder);
  private platformId = inject(PLATFORM_ID);
  private cdr = inject(ChangeDetectorRef);
  private authService = inject(AuthService);
  private facturacionService = inject(FacturacionService);
  private reciboService = inject(ReciboService);
  private articulosLazyService = inject(ArticulosLazyService);

  // Excepción ambiente de pruebas (00): igual que en fac-pos, se registra la venta con un recibo
  // local sin contactar Hacienda. fac.ts solo maneja FAC, así que no hace falta filtrar por tipo.
  // En ambiente 1 esAmbientePrueba() siempre es false y no cambia nada del comportamiento actual.
  esAmbientePrueba = computed(() => this.getAmbiente() === '00');
  esRegistroSinDte = computed(() => this.esAmbientePrueba());
  emitirDteLabel = computed(() => (this.esRegistroSinDte() ? 'Registrar factura' : 'Emitir DTE'));
  isEmpresa2 = computed(() => this.authService.currentUser()?.selectedEmpresa?.idEmpresa === 2);
  private route = inject(ActivatedRoute);
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
  anulacionDialogVisible = signal(false);
  confirmAnulacionDialogVisible = signal(false);
  anulacionMotivo = signal('');
  anulandoDte = signal(false);
  clienteDataDialogVisible = signal(false);
  isLocked = signal(false);
  emitting = signal(false);
  hasSavedCurrentRecord = signal(false);
  highlightAction = signal(false);

  triggerActionHighlight() {
    this.highlightAction.set(true);
    setTimeout(() => {
      this.highlightAction.set(false);
    }, 4800);
  }
  showClienteSelectorDialog = signal(false);
clienteSeleccionadoEnTabla = signal<PerfilClienteDto | null>(null);

abrirSelectorClientes(): void{
this.clienteSeleccionadoEnTabla.set(null);
const actuales = this.perfilClientes();
  this.clientesFiltradosParaTabla.set(actuales);
this.showClienteSelectorDialog.set(true);
}
seleccionarFilaCliente(cliente: PerfilClienteDto): void {
  this.clienteSeleccionadoEnTabla.set(cliente);
}
confirmarSeleccionDesdeTabla(): void {
  const cliente = this.clienteSeleccionadoEnTabla();
  if (cliente) {
    // Usamos el nombre para disparar tu lógica existente de onClienteSelect
    this.onClienteSelect(cliente.NOMBRE || ''); 
    this.showClienteSelectorDialog.set(false);
  }
}
filtrarClientesSelector(event: Event): void {
  const query = (event.target as HTMLInputElement).value.toLowerCase().trim();
  const todosLosClientes = this.perfilClientes();

  if (!query) {
    this.clientesFiltradosParaTabla.set(todosLosClientes);
    return;
  }

  // Filtramos por Nombre, NIT o Registro (NRC)
  const filtrados = todosLosClientes.filter(c => 
    (c.NOMBRE?.toLowerCase().includes(query)) ||
    (c.NIT?.toLowerCase().includes(query)) ||
    (c.IDENTIFICACION?.toLowerCase().includes(query)) ||
    (c.REGISTRO_COMERCIO?.toLowerCase().includes(query))
  );

  this.clientesFiltradosParaTabla.set(filtrados);
}
cancelarSelectorCliente(): void {
  this.showClienteSelectorDialog.set(false);
}

refreshClientes(): void {
  this.loadingClientes.set(true);
  this.facturacionService.clearClientesCache();
  this.facturacionService.getPerfilClientes()
    .pipe(finalize(() => this.loadingClientes.set(false)))
    .subscribe({
      next: (rows) => {
        const profiles = rows ?? [];
        this.perfilClientes.set(profiles);
        this.clientesFiltradosParaTabla.set(profiles);
        const clientes = Array.from(
          new Set(profiles.map((item) => String(item.NOMBRE ?? '').trim()).filter(Boolean))
        ).sort((a, b) => a.localeCompare(b));
        this.clientesOptions.set(clientes);
        this.clienteSuggestions.set([...clientes]);
      },
      error: () => {
        this.perfilClientes.set([]);
        this.clientesOptions.set([]);
        this.clienteSuggestions.set([]);
      }
    });
}
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
  articuloAutoLoading = signal(false);
  articuloAutoTotal = signal(0);
  loadingClientes = signal(false);
  formasPagoOptions = signal<FormaPagoDto[]>([]);
  retencionesOptions = signal<RetencionCatalogoDto[]>([]);
  condicionesPagoOptions = signal<CondicionPagoCatalogoDto[]>([]);
  clientesFiltradosParaTabla = signal<PerfilClienteDto[]>([]);
  retencionAplicada = signal<{ codigo: string; descripcion: string; monto: number } | null>(null);
  formasPagoDetalle = signal<Array<{ codigo: string; descripcion: string; monto: number }>>([]);
  totalFormasPago = computed(() => this.formasPagoDetalle().reduce((acc, item) => acc + this.toNumber(item.monto), 0));
  isNewUnsaved = computed(() => !this.hasSavedCurrentRecord() && !this.selectedFactura());
    isAnonimoClient = signal(false);

  sucursalOptions = computed(() => {
    const unique = new Map<string, { value: string; label: string }>();
    for (const row of this.sucursalPuntoRows()) {
      const value = String(row.Sucursal ?? '').trim();
      if (!value || unique.has(value)) {
        continue;
      }

      unique.set(value, {
        value,
        label: String(row.NombreSC || row.Sucursal || '').trim()
      });
    }

    return Array.from(unique.values()).sort((a, b) => a.label.localeCompare(b.label));
  });

  puntoVentaOptions = computed(() => {
    const sucursal = this.selectedSucursal().trim();
    if (!sucursal) {
      return [] as Array<{ value: string; label: string }>;
    }

    const unique = new Map<string, { value: string; label: string }>();
    for (const row of this.sucursalPuntoRows()) {
      if (String(row.Sucursal ?? '').trim() !== sucursal) {
        continue;
      }

      const value = String(row.PUNTO_VENTA ?? '').trim();
      if (!value || unique.has(value)) {
        continue;
      }

      unique.set(value, {
        value,
        label: String(row.NombrePV || row.PUNTO_VENTA || '').trim()
      });
    }

    return Array.from(unique.values()).sort((a, b) => a.label.localeCompare(b.label));
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
    Vendedor: [''],
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

  filteredFacturas = computed(() => {
    const term = this.filterText().trim().toLowerCase();
    if (!term) {
      return this.facturas();
    }

    return this.facturas().filter((item) => {
      const joined = [
        item.Factura,
        item.Prefijo,
        item.CLIENTE,
        item.FACTURAR_A,
        item.Tipo_Factura,
        item.CodGeneracion,
        item.NoControl
      ]
        .join(' ')
        .toLowerCase();

      return joined.includes(term);
    });
  });

  facJsonPreview = computed(() => {
    const raw = this.facForm.getRawValue();
    const detalle = this.detalleRows();

    return {
      identificacion: {
        version: 1,
        ambiente: this.getAmbiente(),
        tipoDte: '01',
        numeroControl: raw.NoControl || null,
        codigoGeneracion: raw.CodGeneracion || null,
        tipoModelo: 1,
        tipoOperacion: 1,
        tipoContingencia: null,
        motivoContin: null,
        fecEmi: this.ensureDate(raw.Fecha),
        horEmi: this.currentTime(),
        tipoMoneda: 'USD'
      },
      documentoRelacionado: null,
      emisor: {
        nit: this.authService.currentUser()?.selectedEmpresa?.nit ?? null,
        nrc: this.authService.currentUser()?.selectedEmpresa?.nrc ?? null,
        nombre: this.authService.currentUser()?.selectedEmpresa?.nombreComercial ?? null,
        codActividad: null,
        descActividad: null,
        nombreComercial: this.authService.currentUser()?.selectedEmpresa?.nombreComercial ?? null,
        tipoEstablecimiento: '02',
        direccion: {
          departamento: null,
          municipio: null,
          complemento: null
        },
        telefono: null,
        correo: null,
        codEstableMH: this.resolveCodigoSucursalMh(raw.Sucursal ?? '', raw.PuntoVenta ?? ''),
        codEstable: raw.Sucursal ?? '',
        codPuntoVentaMH: this.resolveCodigoPuntoMh(raw.Sucursal ?? '', raw.PuntoVenta ?? ''),
        codPuntoVenta: raw.PuntoVenta ?? ''
      },
      receptor: {
        tipoDocumento: null,
        numDocumento: raw.Identificacion || null,
        nrc: null,
        nombre: raw.FacturarA || raw.Nombre || 'Sr(a)',
        codActividad: null,
        descActividad: null,
        direccion: {
          departamento: null,
          municipio: null,
          complemento: raw.Direccion || null
        },
        telefono: null,
        correo: raw.CorreoElectronico || null
      },
      otrosDocumentos: null,
      ventaTercero: null,
      cuerpoDocumento: detalle.map((item, index) => ({
        numItem: index + 1,
        tipoItem: 1,
        numeroDocumento: null,
        cantidad: this.toNumber(item.CANTIDAD),
        codigo: item.ARTICULO,
        codTributo: null,
        uniMedida: this.resolveUnidad(item.UNIDAD_MEDIDA),
        descripcion: item.DESCRIPCION,
        precioUni: this.toNumber(item.PRECIO_UNITARIO),
        montoDescu: this.toNumber(item.Descuento),
        ventaNoSuj: 0,
        ventaExenta: 0,
        ventaGravada: this.toNumber(item.TotalVenta || item.TOTAL),
        tributos: null,
        psv: this.toNumber(item.TotalVenta || item.TOTAL),
        noGravado: 0,
        ivaItem: this.calcIvaItem(item)
      })),
      resumen: {
        totalNoSuj: 0,
        totalExenta: 0,
        totalGravada: this.toNumber(raw.Sumas),
        subTotalVentas: this.toNumber(raw.TotalOperacion),
        descuNoSuj: 0,
        descuExenta: 0,
        descuGravada: 0,
        porcentajeDescuento: 0,
        totalDescu: this.toNumber(raw.Descuentos),
        tributos: null,
        subTotal: this.toNumber(raw.TotalOperacion),
        ivaRete1: 0,
        reteRenta: 0,
        montoTotalOperacion: this.toNumber(raw.SubTotalVentas),
        totalNoGravado: 0,
        totalPagar: this.toNumber(raw.TotalFactura),
        totalLetras: this.numberToSimpleWords(this.toNumber(raw.TotalFactura)),
        totalIva: this.toNumber(raw.TotalImpuesto1),
        saldoFavor: 0,
        condicionOperacion: 1,
        pagos: null,
        numPagoElectronico: null
      },
      extension: null,
      apendice: null
    };
  });




  onFilterChange(value: string) {
    this.filterText.set(value);
  }

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
    const isValidPunto = this.puntoVentaOptions().some((option) => option.value === currentPunto);

    if (!isValidPunto) {
      this.facForm.patchValue({ PuntoVenta: '' });
    }
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
          const facRows = (rows ?? []).filter((item) => (item.Tipo_Factura || '').toUpperCase() === 'FAC');
          this.facturas.set(facRows);
        },
        error: (error) => {
          this.showError('Facturación FAC', this.extractError(error, 'No se pudo cargar el listado de facturas.'));
        }
      });
  }

  refreshArticulos(): void {
    this.articuloAutoLoading.set(true);
    this.facturacionService.clearArticulosCache('BOD01');
    this.facturacionService.getArticulosPorBodega('BOD01').subscribe({
      next: (rows: ArticuloPorBodegaDto[]) => {
        this.articulosOptions.set(rows);
        this.articuloSuggestions.set(rows.map((item: ArticuloPorBodegaDto) => this.toArticuloDisplay(item)));
        this.articuloAutoTotal.set(rows.length);
      },
      error: () => {
        this.articulosOptions.set([]);
        this.articuloSuggestions.set([]);
        this.articuloAutoTotal.set(0);
      },
      complete: () => this.articuloAutoLoading.set(false)
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
      IdFactura: 0,
      Estado: 'BORRADOR',
      Fecha: this.formatDateInput(new Date()),
      Sucursal: '',
      PuntoVenta: '',
      Cliente: '',
      FacturarA: '',
        NombreFacturarA: '',
      Nombre: '',
      NIT: '',
      Identificacion: '',
      RegistroComercio: '',
      Giro: '',
      CorreoElectronico: '',
      Pais: '',
      Departamento: '',
      Municipio: '',
      Direccion: '',
      IncluyeIVA: true,
      RetencionIvaCodigo: '',
      IvaRetenido: 0,
      CondicionPago: '',
      Vendedor: '',
      FormaPagoCodigo: '',
      FormaPagoMonto: 0,
      Observaciones: '',
      LineaArticulo: '',
      LineaDescripcion: '',
      LineaCantidad: 1,
      LineaPrecio: 0,
      Sumas: 0,
      Descuentos: 0,
      TotalOperacion: 0,
      TotalFactura: 0,
      SubTotalVentas: 0,
      TotalImpuesto1: 0,
      CodGeneracion: this.generateCodigoGeneracion(),
      NoControl: '',
      SelloRecepcion: '',
      IdDTE: 0
    });

    this.blockEmissionFields();
    this.selectedSucursal.set('');
    this.applyDefaultSucursalPunto();
    this.applyDefaultFormaPago();
    this.syncTotalsFromDetalle();
    this.isAnonimoClient.set(false);
    this.retencionAplicada.set(null);
    this.evaluarPrecioLineaEditable(0);
    this.abrirSelectorClientes();
  }

  openEdit(item: FacturaGeneralDto) {
    const idEmpresa = this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0;
    const sucursal = String(item.CODIGOSUCURSAL || item.SUCURSAL || '').trim();
    const puntoVenta = String(item.PUNTO_VENTA || '').trim();

    this.showDetail.set(true);
    this.loadingDetail.set(true);
    this.selectedFactura.set(item);
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
        },
        error: (error) => {
          this.showError('Facturación FAC', this.extractError(error, 'No se pudo cargar el detalle de la factura.'));
        }
      });
  }

  closeDetail() {
    this.showDetail.set(false);
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
        this.showError('Facturación FAC', this.extractError(error, 'No se pudo registrar el pago.'));
      }
    });
  }

  onReenviarCorreo(item: FacturaGeneralDto): void {
    const idEmpresa = this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0;
    const idFactura = this.toNumber(item.iddoc);
    const perfil = this.perfilClientes().find((c) => String(c.CLIENTE ?? '').trim() === String(item.CLIENTE ?? '').trim());
    const correoDefault = String(perfil?.CORREO_ELECTRONICO ?? '').trim();

    if (this.esAmbientePrueba()) {
      this.reenviarCorreoDialog.abrir(idEmpresa, idFactura, 'FAC', correoDefault, (correoDestino) =>
        this.enviarReciboDesdeListado(item, correoDestino)
      );
      return;
    }

    this.reenviarCorreoDialog.abrir(idEmpresa, idFactura, 'FAC', correoDefault);
  }

  guardar() {
    if (!this.canSave()) {
      this.showError('Facturación FAC', 'Solo las facturas en elaboración permiten guardar cambios.');
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
    this.showInfo('Facturación FAC', 'Seleccione un cliente de la lista para continuar.');
  }

  private executeGuardar() {

    const cliente = String(this.facForm.controls.FacturarA.value ?? '').trim()
      || String(this.facForm.controls.Cliente.value ?? '').trim();
    if (!cliente) {
      this.showError('Facturación FAC', 'Debe seleccionar un cliente antes de guardar.');
      return;
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
          this.hasSavedCurrentRecord.set(true);
          this.showInfo('Facturación FAC', 'Factura guardada correctamente.');
          this.loadMaestro();
        },
        error: (error) => {
          this.showError(
            'Facturación FAC',
            this.extractError(error, 'No se pudo guardar la factura. Verifica endpoint UpdateFactura en API.')
          );
        }
      });
  }

  aplicar() {
    if (!this.canApply()) {
      this.showError('Facturación FAC', 'Solo las facturas en elaboración permiten aplicar.');
      return;
    }

    if (!this.validarFormasPago()) {
      return;
    }

    const idFactura = this.facForm.controls.IdFactura.value;
    if (!idFactura) {
      this.showError('Facturación FAC', 'Primero debe guardar la factura para poder aplicarla.');
      return;
    }

    const raw = this.facForm.getRawValue();
    const payload: UpdateFacturacionAplicacionDto = {
      CodGeneracion: String(raw.CodGeneracion ?? '').trim(),
      Sucursal: String(raw.Sucursal ?? '').trim(),
      PuntoVenta: String(raw.PuntoVenta ?? '').trim(),
      TipoFactura: String(this.selectedFactura()?.Tipo_Factura ?? 'FAC').trim() || 'FAC',
      Usuario: String(this.authService.currentUser()?.username ?? '').trim(),
      IdEmpresa: this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0,
      TipoMtto: 'Aplicar'
    };

    this.facturacionService
      .updateFacturacionAplicacion(payload)
      .subscribe({
      next: () => {
        this.isLocked.set(true);
        this.facForm.patchValue({ Estado: 'APLICADO' });
        this.showInfo('Facturación FAC', 'Factura aplicada correctamente.');
      },
      error: (error) => {
        this.showError('Facturación FAC', this.extractError(error, 'No se pudo aplicar la factura.'));
      }
    });
  }

  desaplicar() {
    if (!this.canDesaplicar()) {
      this.showError('Facturación FAC', 'Solo las facturas aplicadas sin sello de recepción permiten desaplicar.');
      return;
    }

    const idFactura = this.facForm.controls.IdFactura.value;
    if (!idFactura) {
      this.showError('Facturación FAC', 'No hay factura para desaplicar.');
      return;
    }

    const raw = this.facForm.getRawValue();
    const payload: UpdateFacturacionAplicacionDto = {
      CodGeneracion: String(raw.CodGeneracion ?? '').trim(),
      Sucursal: String(raw.Sucursal ?? '').trim(),
      PuntoVenta: String(raw.PuntoVenta ?? '').trim(),
      TipoFactura: String(this.selectedFactura()?.Tipo_Factura ?? 'FAC').trim() || 'FAC',
      Usuario: String(this.authService.currentUser()?.username ?? '').trim(),
      IdEmpresa: this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0,
      TipoMtto: 'Desaplicar'
    };

    this.facturacionService.updateFacturacionAplicacion(payload).subscribe({
      next: () => {
        this.isLocked.set(false);
        this.facForm.patchValue({ Estado: 'ELABORACION' });
        this.showInfo('Facturación FAC', 'Factura desaplicada correctamente.');
      },
      error: (error) => {
        this.showError('Facturación FAC', this.extractError(error, 'No se pudo desaplicar la factura.'));
      }
    });
  }

  solicitarEliminarFactura(item: FacturaGeneralDto) {
    if (!this.canEliminarFactura(item)) {
      this.showError('Facturación FAC', 'Solo facturas en elaboración o pendientes de emitir permiten eliminar.');
      return;
    }

    this.eliminarConfirmDialog.abrir(() => this.eliminarFactura(item));
  }

  eliminarFactura(item: FacturaGeneralDto, retryAfterDesaplicar: boolean = true) {
    if (!this.canEliminarFactura(item)) {
      this.showError('Facturación FAC', 'Solo facturas en elaboración o pendientes de emitir permiten eliminar.');
      return;
    }

    const payload: DeleteFacturaDto = {
      Prefijo: String(item.Prefijo ?? '').trim(),
      Factura: String(item.Factura ?? '').trim(),
      Sucursal: this.resolveSucursalCodigoFromFactura(item),
      PuntoVenta: String(item.PUNTO_VENTA ?? '').trim(),
      TipoFactura: String(item.Tipo_Factura ?? 'FAC').trim() || 'FAC',
      Fecha: this.resolveFacturaGeneralDate(item.FECHA)
    };

    this.facturacionService.deleteFactura(payload).subscribe({
      next: () => {
        this.showInfo('Facturación FAC', 'Factura eliminada correctamente.');
        this.loadMaestro();
      },
      error: (error) => {
        if (retryAfterDesaplicar && this.shouldRetryDeleteAfterDesaplicar(error)) {
          this.executeDesaplicarForDelete(item).subscribe({
            next: () => {
              this.eliminarFactura(item, false);
            },
            error: (desaplicarError) => {
              this.showError('Facturación FAC', this.extractError(desaplicarError, 'No se pudo desaplicar antes de eliminar la factura.'));
            }
          });
          return;
        }

        this.showError('Facturación FAC', this.extractError(error, 'No se pudo eliminar la factura.'));
      }
    });
  }

  anularDte() {
    if (!this.canAnularDte()) {
      this.showError('Facturación FAC', 'Solo las facturas aplicadas con sello de recepción permiten anular DTE.');
      return;
    }

    const idFactura = this.facForm.controls.IdFactura.value;
    if (!idFactura) {
      this.showError('Facturación FAC', 'No hay factura para anular.');
      return;
    }

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

  solicitarConfirmarAnulacion() {
    const motivo = this.anulacionMotivoNormalizado();
    if (!motivo) {
      this.showError('Facturación FAC', 'Debe ingresar un motivo de anulación válido.');
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
      this.showError('Facturación FAC', 'No hay factura para anular.');
      return;
    }

    const idEmpresa = this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0;
    if (!idEmpresa) {
      this.showError('Facturación FAC', 'No se encontró IdEmpresa en la sesión.');
      return;
    }

    const motivoAnulacion = this.anulacionMotivoNormalizado();
    if (!motivoAnulacion) {
      this.showError('Facturación FAC', 'Debe ingresar un motivo de anulación válido.');
      this.focusAnulacionMotivoInput();
      return;
    }

    const apiBaseUrl = this.authService.getEmissionApiBaseUrl();
    if (!apiBaseUrl) {
      this.showError('Facturación FAC', 'No se encontró UrlAPI en la sesión de empresa.');
      return;
    }

    const raw = this.facForm.getRawValue();
    const empresa = this.authService.currentUser()?.selectedEmpresa;
    const nombreSolicita = this.authService.getCurrentNombreUsuario() || String(this.authService.currentUser()?.username ?? '').trim();
    const duiSolicita = this.authService.getCurrentDui();
    if (!duiSolicita) {
      this.showError('Facturación FAC', 'No se encontró DUI del usuario para anular el DTE. Inicie sesión nuevamente.');
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

    const tipoFactura = String(this.selectedFactura()?.Tipo_Factura ?? 'FAC').trim() || 'FAC';
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
                this.showError('Facturación FAC', this.extractError(correoError, 'Documento anulado, pero falló el envío de correo de notificación.'));
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
          this.showInfo('Facturación FAC', 'Documento anulado correctamente.');
          this.refreshEncabezadoAfterEmission();
          this.loadMaestro();
        },
        error: (error) => {
          this.showError('Facturación FAC', this.extractError(error, 'No se pudo anular el DTE.'));
        }
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
      const input = document.getElementById('fac-anulacion-motivo') as HTMLInputElement | null;
      if (!input) {
        return;
      }

      input.focus();
      input.select();
    });
  }

  vistaPrevia() {
    if (this.previewLoading()) {
      return;
    }

    if (!this.canVistaPrevia()) {
      this.showError('Facturación FAC', 'No se permite vista previa/imprimir para documentos anulados.');
      return;
    }

    const idFactura = this.toNumber(this.facForm.controls.IdFactura.value);
    if (!idFactura) {
      this.showError('Facturación FAC', 'Guarde la factura antes de abrir la vista previa.');
      return;
    }

    if (this.esRegistroSinDte() && this.currentEstado() === 'APLICADO') {
      this.imprimirRecibo();
      return;
    }

    const idEmpresa = this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0;
    if (!idEmpresa) {
      this.showError('Facturación FAC', 'No se encontró IdEmpresa en la sesión.');
      return;
    }

    const tipoFactura = String(this.selectedFactura()?.Tipo_Factura ?? 'FAC').trim() || 'FAC';
    const emitido = !this.isSelloRecepcionEmpty(this.facForm.controls.SelloRecepcion.value);
    const previewUrl = this.facturacionService.getPreviewDteUrl(idEmpresa, idFactura, tipoFactura, emitido);

    this.previewLoading.set(true);
    const popup = window.open(previewUrl, '_blank', 'noopener,noreferrer');
    this.previewLoading.set(false);

    if (!popup) {
      this.showError('Facturación FAC', 'El navegador bloqueó la vista previa. Asegúrese de permitir ventanas emergentes.');
    }
  }

  emitirDte() {
    if (!this.validarFormasPago()) {
      return;
    }

    if (!this.canEmit()) {
      this.showError('Facturación FAC', 'Solo las facturas aplicadas sin sello de recepción permiten emitir DTE.');
      return;
    }

    const idFactura = this.facForm.controls.IdFactura.value;
    if (!idFactura) {
      this.showError('Facturación FAC', 'Debe guardar la factura antes de emitir DTE.');
      return;
    }

    if (this.esRegistroSinDte()) {
      this.registrarFacturaSinDte();
      return;
    }

    const apiBaseUrl = this.authService.getEmissionApiBaseUrl();
    if (!apiBaseUrl) {
      this.showError('Facturación FAC', 'No se encontró UrlAPI en la sesión de empresa.');
      return;
    }

    const idEmpresa = this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0;
    const username = this.authService.currentUser()?.username ?? '';
    const raw = this.facForm.getRawValue();
    const ambiente = this.getAmbiente();

    const payload: ParametrosDteDto = {
      idFactura,
      idEmpresa,
      ambiente,
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
          const normalized = String(status ?? '').trim().toLowerCase();
          if (normalized !== 'online') {
            throw new Error('No se puede emitir: servicio de emisión no disponible.');
          }

          this.setStep('service', 'ok', 'Servicio en línea');
          this.setStep('verify', 'running', 'Verificando estado previo del documento');

          return this.refreshEncabezadoAfterEmission(false).pipe(
            switchMap((encabezado) => {
              if ((encabezado.NoControl || '').trim() || (encabezado.SelloRecepcion || '').trim()) {
                this.setStep('verify', 'ok', 'Documento ya emitido previamente');
                this.setStep('emit', 'ok', 'No se requiere nueva emisión');
                this.setStep('sync', 'ok', 'Datos recuperados desde base de datos');
                this.showInfo('Facturación FAC', 'La factura ya estaba emitida y se sincronizó su información.');
                return of(null);
              }

              this.setStep('verify', 'ok', 'Documento listo para emisión');
              this.setStep('emit', 'running', 'Enviando documento a Hacienda');
              return this.facturacionService.emitirFac(apiBaseUrl, payload).pipe(
                timeout(FacComponent.EMIT_TIMEOUT_MS),
                catchError((emitError) => this.reconciliarEmisionPerdida$(emitError))
              );
            })
          );
        }),
        switchMap((response) => {
          if (!response) {
            return of(null);
          }

          if (!(response.SelloRecepcion ?? '').toString().trim()) {
            const message = String(response.MensajeGeneral ?? 'La emisión no devolvió sello de recepción.');
            throw new Error(message);
          }

          this.setStep('emit', 'ok', 'Documento emitido correctamente');
          this.setStep('sync', 'running', 'Recuperando sello y número de control');
          return this.refreshEncabezadoAfterEmission(false).pipe(
              switchMap(() => {
                this.setStep('sync', 'ok', 'Datos actualizados');
                this.setStep('correo', 'running', 'Enviando correo y obteniendo formato visual');
                return this.facturacionService.enviarCorreoDte(idEmpresa, idFactura, "FAC").pipe(
                  map((html) => ({ emitido: true, html: this.normalizeDteVisualHtml(html) })),
                  catchError((correoError) => {
                    this.setStep('correo', 'error', this.extractError(correoError, 'No se pudo enviar correo ni recuperar formato visual.'));
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
            if (result.html) {
              this.openDteVisualPreview(result.html);
            }
            this.setStep('correo', 'ok', 'Correo enviado y vista previa abierta');
            this.showInfo('Facturación FAC', 'DTE emitido correctamente.');
          }
          this.loadMaestro();
        },
        error: (error) => {
          this.setStep('emit', 'error', this.extractError(error, 'Falló la emisión del DTE.'));
          this.showError('Facturación FAC', this.extractError(error, 'Falló la emisión del DTE.'));
        }
      });
  }

  /**
   * Reconciliación de emisión: si la respuesta de emisión se pierde (timeout/red inestable), el
   * documento pudo haberse emitido igual. Reconsulta el encabezado; si ya trae Sello, devuelve una
   * respuesta sintética para RECONECTAR el flujo y culminarlo (sincronizar → correo → vista previa)
   * sin reemitir. Si tras varios reintentos no hay sello, propaga el error real.
   */
  private reconciliarEmisionPerdida$(emitError: unknown): Observable<RespuestaDteDto> {
    this.setStep('emit', 'running', 'Sin respuesta de Hacienda; verificando si el documento se emitió…');

    const chequear$ = (intento: number): Observable<RespuestaDteDto> =>
      this.refreshEncabezadoAfterEmission(false).pipe(
        switchMap((enc) => {
          const sello = String(enc?.SelloRecepcion ?? '').trim();
          const noControl = String(enc?.NoControl ?? '').trim();
          if (sello) {
            this.setStep('emit', 'ok', 'Emisión confirmada (respuesta recuperada tras la interrupción)');
            return of({
              SelloRecepcion: sello,
              NoControl: noControl,
              CodigoGeneracion: String(enc?.CodGeneracion ?? '').trim(),
              MensajeGeneral: 'Emisión reconciliada'
            } as RespuestaDteDto);
          }
          if (intento >= FacComponent.RECONCILE_MAX_INTENTOS - 1) throw emitError;
          return timer(FacComponent.RECONCILE_INTERVAL_MS).pipe(switchMap(() => chequear$(intento + 1)));
        })
      );

    return chequear$(0);
  }

  isReadOnlyField(): boolean {
    return this.emitting() || this.currentEstado() !== 'ELABORACION';
  }

  // Editabilidad del precio: se decide con el precio BASE del artículo (estable), no con el valor
  // en vivo. Si dependiera del valor actual, al teclear el 1er dígito (precio ≠ 0) se bloquearía a
  // mitad de escritura para usuarios no admin (input readonly, spinners desaparecen).
  private precioLineaEditable = true;

  private evaluarPrecioLineaEditable(precioBase: number, tipoArticulo?: string): void {
    const esAdmin = String(this.authService.currentUser()?.tipoUsuario ?? '').trim().toUpperCase() === 'A';
    const esServicio = String(tipoArticulo ?? '').trim().toUpperCase() === 'SV';
    this.precioLineaEditable = esAdmin || esServicio || Number(precioBase ?? 0) <= 0;
  }

  canEditPrecioLinea(): boolean {
    return this.precioLineaEditable;
  }

  currentEstado(): 'ELABORACION' | 'APLICADO' | 'ANULADO' | 'OTRO' {
    return this.normalizeEstadoValue(this.facForm.controls.Estado.value);
  }

  estadoVisualKey(estado: unknown, selloRecepcion: unknown): 'ELABORACION' | 'PENDIENTE_EMITIR' | 'EMITIDO' | 'ANULADO' | 'OTRO' {
    const normalized = this.normalizeEstadoValue(estado);

    if (normalized === 'APLICADO') {
      if (this.esRegistroSinDte()) {
        return 'EMITIDO';
      }
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

    if (!estado || estado === 'BORRADOR' || estado === 'ELABORACION') {
      return 'ELABORACION';
    }

    if (estado === 'APLICADA' || estado === 'APLICADO') {
      return 'APLICADO';
    }

    if (estado === 'ANULADA' || estado === 'ANULADO') {
      return 'ANULADO';
    }

    return 'OTRO';
  }

  hasSelloRecepcion(): boolean {
    return !!String(this.facForm.controls.SelloRecepcion.value ?? '').trim();
  }

  private isSelloRecepcionEmpty(value: unknown): boolean {
    return !String(value ?? '').trim();
  }

  canSave(): boolean {
    return !this.emitting() && this.currentEstado() === 'ELABORACION';
  }

  canApply(): boolean {
    return !this.emitting() && this.currentEstado() === 'ELABORACION' && !!this.facForm.controls.IdFactura.value;
  }

  canDesaplicar(): boolean {
    return !this.emitting() && this.currentEstado() === 'APLICADO' && !this.hasSelloRecepcion() && !!this.facForm.controls.IdFactura.value;
  }

  canEmit(): boolean {
    return !this.emitting() && this.currentEstado() === 'APLICADO' && !this.hasSelloRecepcion() && !!this.facForm.controls.IdFactura.value;
  }

  canAnularDte(): boolean {
    return !this.emitting() && this.currentEstado() === 'APLICADO' && this.hasSelloRecepcion() && !!this.facForm.controls.IdFactura.value;
  }

  canVistaPrevia(): boolean {
    const visual = this.estadoVisualKey(
      this.facForm.controls.Estado.value,
      this.facForm.controls.SelloRecepcion.value
    );
    return !!this.facForm.controls.IdFactura.value && visual !== 'ANULADO';
  }

  canEliminarFactura(item: FacturaGeneralDto): boolean {
    const visual = this.estadoVisualKey(item.ESTADO, item.SelloRecepcion);
    return visual === 'ELABORACION' || visual === 'PENDIENTE_EMITIR';
  }

  selectInputText(event: FocusEvent) {
    const input = event.target as HTMLInputElement | null;

    if (!input || input.readOnly || input.disabled) {
      return;
    }

    requestAnimationFrame(() => input.select());
  }

  shouldSuppressMobileKeyboard(): boolean {
    if (!isPlatformBrowser(this.platformId) || typeof window === 'undefined' || !window.matchMedia) {
      return false;
    }

    return window.matchMedia('(pointer: coarse) and (max-width: 991.98px)').matches;
  }

  onNumericKeyDown(event: KeyboardEvent) {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    const key = event.key;
    const allowedKeys = ['Backspace', 'Delete', 'Tab', 'Enter', 'Escape', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];

    if (allowedKeys.includes(key)) {
      return;
    }

    if (/^[0-9]$/.test(key)) {
      return;
    }

    const target = event.target as HTMLInputElement | null;
    if ((key === '.' || key === ',') && target && !target.value.includes('.') && !target.value.includes(',')) {
      return;
    }

    event.preventDefault();
  }

  sanitizeNumericInput(event: Event) {
    const input = event.target as HTMLInputElement | null;
    if (!input) {
      return;
    }

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

    if (!normalized) {
      this.clienteSuggestions.set([...options]);
      return;
    }

    this.clienteSuggestions.set(options.filter((item) => item.toLowerCase().includes(normalized)));
  }

  onClienteSelect(value: string) {
    const selectedNombre = String(value ?? '').trim();
    const normalizedNombre = selectedNombre.toLowerCase();

    const profile = this.perfilClientes().find((item) => {
      const nombre = String(item.NOMBRE ?? '').trim().toLowerCase();
      const cliente = String(item.CLIENTE ?? '').trim().toLowerCase();
      return nombre === normalizedNombre || cliente === normalizedNombre;
    });

    const cliente = String(profile?.CLIENTE ?? '').trim();
    const nombre = String(profile?.NOMBRE ?? selectedNombre).trim();
    const isAnonimo = nombre.toLowerCase() === 'sr(a)';
    this.isAnonimoClient.set(isAnonimo);

    this.facForm.patchValue({
      FacturarA: nombre || cliente,
      NombreFacturarA: isAnonimo ? 'Sr(a)' : '',
      Cliente: cliente,
      CondicionPago: profile?.CONDICION_PAGO ?? this.facForm.controls.CondicionPago.value ?? '',
      Vendedor: profile?.VENDEDOR ?? this.facForm.controls.Vendedor.value ?? '',
      NIT: profile?.NIT ?? '',
      Identificacion: profile?.IDENTIFICACION ?? '',
      RegistroComercio: profile?.REGISTRO_COMERCIO ?? '',
      Giro: profile?.Giro ?? '',
      CorreoElectronico: profile?.CORREO_ELECTRONICO ?? '',
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

    if (!normalized) {
      this.articuloSuggestions.set(options);
      return;
    }

    this.articuloSuggestions.set(options.filter((item) => item.toLowerCase().includes(normalized)));
  }

  onArticuloSelect(displayValue: string) {
    const display = String(displayValue ?? '').trim();
    const articulo = this.findArticuloByDisplay(display);

    if (!articulo) {
      this.facForm.patchValue({
        LineaArticulo: '',
        LineaDescripcion: ''
      });
      return;
    }

    this.facForm.patchValue({
      LineaArticuloDisplay: this.toArticuloDisplay(articulo),
      LineaArticulo: articulo.ARTICULO,
      LineaDescripcion: articulo.DESCRIPCION,
      LineaPrecio: articulo.ULTIMO_PRECIO ?? 0,
      LineaPrecioMayoreo: articulo.PRECIO_MAYOREO ?? 0,
      LineaCantidadMinimaMayoreo: articulo.cantidadmayoreo ?? 0
    });
    this.evaluarPrecioLineaEditable(articulo.ULTIMO_PRECIO ?? 0, articulo.TIPO_ARTICULO);
    this.focusLineaCantidadInput();
  }

  onRetencionChange(value: string) {
    if (this.isNewUnsaved()) {
      return;
    }

    const retencionCodigo = String(value ?? '').trim();
    if (!retencionCodigo) {
      return;
    }

    this.facForm.patchValue({ RetencionIvaCodigo: retencionCodigo });
    this.syncTotalsFromDetalle();
    this.updateFacturaRetencion(retencionCodigo);
  }

  eliminarRetencionAplicada() {
    if (this.isReadOnlyField() || this.isNewUnsaved()) {
      return;
    }

    this.facForm.patchValue({ RetencionIvaCodigo: '' });
    this.syncTotalsFromDetalle();
    this.updateFacturaRetencion('');
  }

  private focusLineaCantidadInput() {
    if (!isPlatformBrowser(this.platformId) || typeof document === 'undefined') return;
    requestAnimationFrame(() => {
      const input = document.getElementById('linea-cant') as HTMLInputElement | null;
      if (!input || input.readOnly || input.disabled) return;
      input.focus();
      input.select();
    });
  }

  private refreshDetalleYTotales() {
    const raw = this.facForm.getRawValue();
    const selected = this.selectedFactura();
    let prefijo = selected?.Prefijo || '';
    let factura = selected?.Factura || '';

    if (!prefijo && !factura) {
      const codGeneracion = String(raw.CodGeneracion ?? '').trim();
      if (codGeneracion && codGeneracion.length >= 36) {
        prefijo = codGeneracion.substring(0, 18);
        factura = codGeneracion.substring(18, 36);
      }
    }

    const sucursal = String(selected?.CODIGOSUCURSAL || selected?.SUCURSAL || raw.Sucursal || '').trim();
    const puntoVenta = String(selected?.PUNTO_VENTA || raw.PuntoVenta || '').trim();

    if (!prefijo || !factura) return;

    this.loadingDetail.set(true);
    this.facturacionService.getFacturaDetalle(prefijo, factura, sucursal, puntoVenta, 'FAC')
      .pipe(finalize(() => {
        this.loadingDetail.set(false);
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (detalle) => {
          this.detalleRows.set(detalle ?? []);
          this.syncTotalsFromDetalle();
        },
        error: (error) => {
          this.showError('Facturación FAC', this.extractError(error, 'No se pudo recargar el detalle actualizado.'));
        }
      });
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
    if (this.isReadOnlyField()) {
      return;
    }

    if (this.isNewUnsaved()) {
      this.showError('Facturación FAC', 'Guarde el encabezado antes de agregar formas de pago.');
      return;
    }

    const codigo = String(this.facForm.controls.FormaPagoCodigo.value ?? '').trim();
    const monto = this.toNumber(this.facForm.controls.FormaPagoMonto.value);
    const idFactura = this.toNumber(this.facForm.controls.IdFactura.value);

    if (!codigo) {
      this.showError('Facturación FAC', 'Debe seleccionar una forma de pago.');
      return;
    }

    if (monto <= 0) {
      this.showError('Facturación FAC', 'El monto de la forma de pago debe ser mayor a cero.');
      return;
    }

    if (idFactura <= 0) {
      this.showError('Facturación FAC', 'No se pudo obtener IdFactura. Guarde nuevamente e intente agregar la forma de pago.');
      return;
    }

    const forma = this.formasPagoOptions().find((item) => String(item.Codigo ?? '').trim() === codigo);
    const descripcion = String(forma?.Descripcion ?? codigo).trim();

    const exists = this.formasPagoDetalle().some((item) => String(item.codigo ?? '').trim() === codigo);
    if (exists) {
      this.showError('Facturación FAC', `La forma de pago ${descripcion} ya está registrada en esta factura.`);
      return;
    }

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
        this.showError('Facturación FAC', this.extractError(error, 'No se pudo registrar la forma de pago.'));
      }
    });
  }

  eliminarFormaPago(index: number) {
    if (this.isReadOnlyField()) {
      return;
    }

    if (this.isNewUnsaved()) {
      return;
    }

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
        this.showError('Facturación FAC', this.extractError(error, 'No se pudo eliminar la forma de pago.'));
      }
    });
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

  agregarDetalleManual(skipAutoSave: boolean = false) {
    if (this.isReadOnlyField()) {
      return;
    }

    if (this.saving()) {
      return;
    }

    const articulo = String(this.facForm.controls.LineaArticulo.value ?? '').trim();
    const descripcion = String(this.facForm.controls.LineaDescripcion.value ?? '').trim();
    const cantidad = this.toNumber(this.facForm.controls.LineaCantidad.value);
    const precio = this.toNumber(this.facForm.controls.LineaPrecio.value);

    if (!articulo) {
      this.showError('Facturación FAC', 'Debe seleccionar o ingresar un articulo.');
      return;
    }

    if (!descripcion) {
      this.showError('Facturación FAC', 'Debe ingresar una descripcion para la linea.');
      return;
    }

    if (cantidad <= 0 || precio < 0) {
      this.showError('Facturación FAC', 'Cantidad y precio deben ser valores validos.');
      return;
    }

    if (precio === 0) {
      this.showError('Facturación FAC', 'No se puede agregar una línea con precio unitario en cero.');
      return;
    }

    const codGeneracion = String(this.facForm.controls.CodGeneracion.value ?? '').trim();
    if (!codGeneracion) {
      this.showError('Facturación FAC', 'No se encontró código de generación para registrar el detalle.');
      return;
    }

    if (!skipAutoSave && (this.toNumber(this.facForm.controls.IdFactura.value) <= 0 || this.isNewUnsaved())) {
      this.guardarEncabezadoConSrAParaAgregarDetalle();
      return;
    }

    const incluyeIva = !!this.facForm.controls.IncluyeIVA.value;
    const precioUnitarioDetalle = incluyeIva ? precio : Number((precio * 1.13).toFixed(6));

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
        this.facForm.patchValue({
          LineaArticuloDisplay: '',
          LineaArticulo: '',
          LineaDescripcion: '',
          LineaCantidad: 1,
          LineaPrecio: 0,
          LineaPrecioMayoreo: 0,
          LineaCantidadMinimaMayoreo: 0
        });
        this.evaluarPrecioLineaEditable(0);
      },
      error: (error) => {
        this.showError('Facturación FAC', this.extractError(error, 'No se pudo registrar el detalle de factura.'));
      }
    });
  }

  private guardarEncabezadoConSrAParaAgregarDetalle() {
    if (this.saving()) {
      return;
    }

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
          this.showInfo('Facturación FAC', 'Factura guardada.');
          this.agregarDetalleManual(true);
        },
        error: (error) => {
          this.showError(
            'Facturación FAC',
            this.extractError(error, 'No se pudo guardar el encabezado antes de agregar el detalle.')
          );
        }
      });
  }

  eliminarDetalle(linea: number) {
    if (this.isReadOnlyField()) {
      return;
    }

    if (this.isNewUnsaved()) {
      return;
    }

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
        this.showError('Facturación FAC', this.extractError(error, 'No se pudo eliminar el detalle de factura.'));
      }
    });
  }

  private loadInitial() {
    const usuario = this.authService.currentUser()?.username ?? '';
    this.facturacionService.getSucursalPuntoVendedor(usuario).subscribe({
      next: (rows) => {
        this.sucursalPuntoRows.set(rows ?? []);
        this.applyDefaultSucursalPunto();
      },
      error: () => this.sucursalPuntoRows.set([])
    });

    this.facturacionService.getPerfilClientes().subscribe({
      next: (rows) => {
        const profiles = rows ?? [];
        this.perfilClientes.set(profiles);
this.clientesFiltradosParaTabla.set(profiles);
        const clientes = Array.from(
          new Set(
            profiles
              .map((item) => String(item.NOMBRE ?? '').trim())
              .filter((name) => !!name)
          )
        ).sort((a, b) => a.localeCompare(b));

        this.clientesOptions.set(clientes);
        this.clienteSuggestions.set([...clientes]);
      },
      error: () => {
        this.perfilClientes.set([]);
        this.clientesOptions.set([]);
        this.clienteSuggestions.set([]);
      }
    });


    // Siempre forzar catálogo actualizado
    // Carga inicial: vacío, para no saturar
    this.articulosOptions.set([]);
    this.articuloSuggestions.set([]);
  }

  // Lazy loading para autocomplete de artículos
    onArticuloCompleteLazy(query: string) {
    const filtro = String(query ?? '').trim();
    this.articuloAutoLoading.set(true);
    this.articulosLazyService.getArticulosPorBodegaLazy('BOD01', filtro, 0, 20).subscribe({
      next: (rows) => {
        this.articulosOptions.set(rows);
        this.articuloSuggestions.set(rows.map((item) => this.toArticuloDisplay(item)));
        this.articuloAutoTotal.set(rows.length);
      },
      error: () => {
        this.articulosOptions.set([]);
        this.articuloSuggestions.set([]);
        this.articuloAutoTotal.set(0);
      },
      complete: () => this.articuloAutoLoading.set(false)
    });

  }

  constructor() {
    this.blockEmissionFields();
    this.loadInitial();

    this.facturacionService.getFormasPago().subscribe({
      next: (rows) => {
        const items = (rows ?? []).filter((item) => !!String(item.Codigo ?? '').trim());
        this.formasPagoOptions.set(items);
        this.applyDefaultFormaPago();
      },
      error: () => {
        this.formasPagoOptions.set([]);
      }
    });

    this.facturacionService.getCatalogoRetenciones().subscribe({
      next: (rows) => {
        const items = (rows ?? []).filter((item) => !!String(item.RETENCION ?? '').trim());
        this.retencionesOptions.set(items);
      },
      error: () => {
        this.retencionesOptions.set([]);
      }
    });
    this.facturacionService.getCatalogoCondicionPago().subscribe({
      next: (rows) => this.condicionesPagoOptions.set(rows ?? []),
      error: () => this.condicionesPagoOptions.set([])
    });

    this.route.queryParams.subscribe((params) => {
      const facturaParam = String(params['factura'] || params['iddoc'] || '').trim();
      const fechaParam = toIsoDateStr(params['fecha']);
      if (facturaParam) {
        let dateChanged = false;
        if (fechaParam) {
          if (fechaParam < this.desde()) {
            this.desde.set(fechaParam);
            dateChanged = true;
          }
          if (fechaParam > this.hasta()) {
            this.hasta.set(fechaParam);
            dateChanged = true;
          }
        }
        if (dateChanged) {
          this.facturacionService['invalidateCacheByPrefix']('facturasGeneral:');
          this.loadMaestro();
        } else {
          this.loadMaestro();
        }
        this.facturacionService.getFacturasGeneral(this.desde(), this.hasta()).subscribe((rows) => {
          const found = (rows ?? []).filter(item => (item.Tipo_Factura || '').toUpperCase() === 'FAC')
            .find((r) => {
              const fullR = `${r.Prefijo || ''}${r.Factura || ''}`.trim();
              const factR = String(r.Factura || '').trim();
              const docR = String(r.iddoc || '').trim();
              return fullR === facturaParam || factR === facturaParam || docR === facturaParam;
            });
          if (found) {
            this.openEdit(found);
            this.triggerActionHighlight();
          }
        });
      } else {
        this.loadMaestro();
      }
    });
  }

  private patchEncabezado(encabezado: FacturaEncabezadoDto) {
    const prefijo = String(encabezado.Prefijo ?? '').trim();
    const factura = String(encabezado.Factura ?? '').trim();
    const codigoGeneracion = `${prefijo}${factura}`.trim();

    const loadedProfile = this.perfilClientes().find(
        (p) => String(p.CLIENTE ?? '').trim() === String(encabezado.Cliente ?? '').trim()
      );
    const isAnonimo = String(loadedProfile?.NOMBRE ?? '').trim().toLowerCase() === 'sr(a)';
    this.isAnonimoClient.set(isAnonimo);
    const normalizedTotals = this.normalizeFacturaTotals({
      sumas: encabezado.Sumas,
      descuentos: this.resolveDescuentosFromEncabezado(encabezado),
      totalOperacion: encabezado.TotalOperacion,
      iva: encabezado.TotalImpuesto1,
      subTotalVentas: encabezado.SubTotalVentas,
      retencion: encabezado.Retencion,
      totalFactura: encabezado.TotalFactura
    });

    this.facForm.patchValue({
      IdFactura: encabezado.IdFactura,
      Estado: encabezado.Estado,
      Fecha: this.formatDateInput(encabezado.Fecha),
      Sucursal: encabezado.Sucursal,
      PuntoVenta: encabezado.PuntoVenta,
      Cliente: encabezado.Cliente,
      FacturarA: isAnonimo ? (loadedProfile?.NOMBRE || 'Sr(a)') : encabezado.FacturarA,
      NombreFacturarA: isAnonimo ? (encabezado.FacturarA || 'Sr(a)') : '',
      Nombre: encabezado.Nombre,
      NIT: encabezado.NIT,
      Identificacion: encabezado.Identificacion,
      RegistroComercio: encabezado.RegistroComercio,
      Giro: encabezado.Giro,
      CorreoElectronico: encabezado.CorreoElectronico,
      Pais: encabezado.Pais,
      Departamento: encabezado.Departamento,
      Municipio: encabezado.Municipio,
      Direccion: encabezado.Direccion,
      IncluyeIVA: true,
      RetencionIvaCodigo: '',
      IvaRetenido: this.toNumber(encabezado.Retencion),
      CondicionPago: encabezado.CondicionPago,
      Vendedor: encabezado.Vendedor,
      FormaPagoCodigo: '',
      FormaPagoMonto: 0,
      Observaciones: encabezado.Observaciones,
      Sumas: normalizedTotals.sumas,
      Descuentos: normalizedTotals.descuentos,
      TotalOperacion: normalizedTotals.totalOperacion,
      TotalFactura: normalizedTotals.totalFactura,
      SubTotalVentas: normalizedTotals.subTotalVentas,
      TotalImpuesto1: normalizedTotals.iva,
      CodGeneracion: codigoGeneracion || encabezado.CodGeneracion || this.generateCodigoGeneracion(),
      NoControl: encabezado.NoControl || '',
      SelloRecepcion: encabezado.SelloRecepcion || '',
      IdDTE: encabezado.IdDTE
    });

    this.blockEmissionFields();
    this.selectedSucursal.set(encabezado.Sucursal || '');
    this.formasPagoDetalle.set([]);
    this.retencionAplicada.set(null);
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
        this.showError('Facturación FAC', this.extractError(error, 'No se pudieron cargar las formas de pago de la factura.'));
      }
    });
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
    
    const sucursal = selected?.CODIGOSUCURSAL || selected?.SUCURSAL || raw.Sucursal || '';
    const punto = selected?.PUNTO_VENTA || raw.PuntoVenta || '';

    return this.facturacionService.getFacturaEncabezado(prefijo, factura, sucursal, punto, idEmpresa).pipe(
      map((encabezado) => {
        this.patchEncabezado(encabezado);
        return encabezado;
      }),
      finalize(() => {
        this.blockEmissionFields();
      })
    );
  }

  private normalizeSaveEncabezado(): Partial<FacturaEncabezadoDto> {
    const raw = this.facForm.getRawValue();
    const selected = this.selectedFactura();
    return {
      IdFactura: raw.IdFactura,
      Estado: raw.Estado ?? 'BORRADOR',
      Fecha: raw.Fecha ?? this.formatDateInput(new Date()),
      Prefijo: selected?.Prefijo ?? '',
      Factura: selected?.Factura ?? '',
      Sucursal: raw.Sucursal ?? '',
      PuntoVenta: raw.PuntoVenta ?? '',
      Cliente: raw.Cliente ?? '',
      FacturarA: raw.FacturarA ?? '',
      Nombre: raw.Nombre ?? '',
      NIT: raw.NIT ?? '',
      Identificacion: raw.Identificacion ?? '',
      RegistroComercio: raw.RegistroComercio ?? '',
      Giro: raw.Giro ?? '',
      CorreoElectronico: raw.CorreoElectronico ?? '',
      Pais: raw.Pais ?? '',
      Departamento: raw.Departamento ?? '',
      Municipio: raw.Municipio ?? '',
      Direccion: raw.Direccion ?? '',
      CondicionPago: raw.CondicionPago ?? 'CONTADO',
      Observaciones: raw.Observaciones ?? '',
      Sumas: this.toNumber(raw.Sumas),
      TotalOperacion: this.toNumber(raw.TotalOperacion),
      TotalFactura: this.toNumber(raw.TotalFactura),
      SubTotalVentas: this.toNumber(raw.SubTotalVentas),
      TotalImpuesto1: this.toNumber(raw.TotalImpuesto1),
      Retencion: this.toNumber(raw.IvaRetenido),
      CodGeneracion: raw.CodGeneracion ?? '',
      NoControl: raw.NoControl ?? '',
      SelloRecepcion: raw.SelloRecepcion ?? '',
      IdDTE: raw.IdDTE
    };
  }

  private buildUpdateFacturaPayload(): UpdateFacturaDto {
    const raw = this.facForm.getRawValue();
    const username = String(this.authService.currentUser()?.username ?? '').trim();
    const condicionPago = String(raw.CondicionPago ?? '').trim() || 'CONTADO';
    const vendedor = String(raw.Vendedor ?? '').trim() || username;
    const fecha = this.ensureDate(raw.Fecha);

    return {
      CodGeneracion: String(raw.CodGeneracion ?? '').trim(),
      Sucursal: String(raw.Sucursal ?? '').trim(),
      PuntoVenta: String(raw.PuntoVenta ?? '').trim(),
      TipoVenta: 'G',
      Cliente: String(raw.Cliente ?? '').trim(),
        FacturarA: this.isAnonimoClient()
          ? String(raw.NombreFacturarA ?? '').trim() || 'Sr(a)'
          : String(raw.FacturarA ?? '').trim(),
      Fecha: fecha,
      CondicionPago: String(condicionPago ?? '').trim(),
      Vendedor: vendedor,
      Observaciones: String(raw.Observaciones ?? '').trim(),
      Usuario: username,
      TipoMtto: this.resolveTipoMtto(),
      Contabilizar: 0,
      SubTotal: this.toNumber(raw.TotalOperacion),
      IVA: this.toNumber(raw.TotalImpuesto1),
      Impuesto2: 0,
      Impuesto3: 0,
      Retencion: this.toNumber(raw.IvaRetenido),
      NIT: String(raw.NIT ?? '').trim(),
      RegistroComercio: String(raw.RegistroComercio ?? '').trim(),
      NumeroResolucion: '',
      ExistenciaFecDoc: 0,
      NumeroControl: String(raw.NoControl ?? '').trim(),
      SelloRecepcion: String(raw.SelloRecepcion ?? '').trim(),
      JSON: JSON.stringify(this.facJsonPreview()),
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
      PrecioConIVA: raw.IncluyeIVA ? 1 : 0,
      Flete: 0,
      Seguro: 0,
      DescuentoAdicional: this.toNumber(raw.Descuentos),
      DTE: this.toNumber(raw.IdDTE),
      CorreoCliente: String(raw.CorreoElectronico ?? '').trim(),
      TipoFactura: 'FAC',
      TipoRegimen: ''
    };
  }

  private buildUpdateFacturaRetencionPayload(retencionCodigo: string): UpdateFacturaRetencionDto {
    const raw = this.facForm.getRawValue();
    const username = String(this.authService.currentUser()?.username ?? '').trim();
    const tipoFactura = String(this.selectedFactura()?.Tipo_Factura ?? 'FAC').trim() || 'FAC';
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
        this.showError('Facturación FAC', this.extractError(error, 'No se pudo actualizar PrecioConIVA.'));
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
        this.showError('Facturación FAC', this.extractError(error, 'No se pudo actualizar la retención.'));
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

  abrirDatosClienteDialog(): void {
    if (!String(this.facForm.controls.CondicionPago.value ?? '').trim()) {
      this.facForm.patchValue({ CondicionPago: 'CONTADO' });
    }
    this.clienteDataDialogVisible.set(true);
  }

  cerrarDatosClienteDialog(): void {
    this.clienteDataDialogVisible.set(false);
  }

  private buildUpdateDetalleFacturaPayload(
    detail: FacturaDetalleDto,
    totals: { totalOperacion: number; iva: number; retencion: number },
    tipoMtto: 'A' | 'B' = 'A'
  ): UpdateDetalleFacturaDto {
    const raw = this.facForm.getRawValue();
    const username = String(this.authService.currentUser()?.username ?? '').trim();
    const tipoFactura = String(this.selectedFactura()?.Tipo_Factura ?? 'FAC').trim() || 'FAC';

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
    const hasSelected = !!this.selectedFactura();
    const hasId = this.toNumber(this.facForm.controls.IdFactura.value) > 0;
    const hasSaved = this.hasSavedCurrentRecord();
    return hasSelected || hasId || hasSaved ? 'C' : 'A';
  }

  private applyDefaultSucursalPunto() {
    const currentSucursal = String(this.facForm.controls.Sucursal.value ?? '').trim();
    if (currentSucursal) {
      return;
    }

    const sucursales = this.sucursalOptions();
    if (!sucursales.length) {
      return;
    }

    const firstSucursal = sucursales[0].value;
    this.selectedSucursal.set(firstSucursal);
    this.facForm.patchValue({ Sucursal: firstSucursal });

    const puntos = this.puntoVentaOptions();
    if (puntos.length) {
      this.facForm.patchValue({ PuntoVenta: puntos[0].value });
    }
  }

  private applyDefaultFormaPago() {
    const current = String(this.facForm.controls.FormaPagoCodigo.value ?? '').trim();
    const options = this.formasPagoOptions();

    if (!options.length) {
      return;
    }

    if (current) {
      const exists = options.some((item) => String(item.Codigo ?? '').trim() === current);
      if (exists) {
        return;
      }
    }

    const firstCode = String(options[0].Codigo ?? '').trim();
    if (firstCode) {
      this.facForm.patchValue({ FormaPagoCodigo: firstCode });
    }
  }

  private validarFormasPago(): boolean {
    const totalPagar = this.toNumber(this.facForm.controls.TotalFactura.value);
    const pagos = this.formasPagoDetalle();

    if (!pagos.length) {
      this.showError('Facturación FAC', 'Debe agregar al menos una forma de pago antes de aplicar.');
      return false;
    }

    const sumaPagos = this.toNumber(this.totalFormasPago());
    const diferencia = Math.abs(Number((sumaPagos - totalPagar).toFixed(2)));

    if (diferencia > 0.009) {
      this.showError(
        'Facturación FAC',
        `La suma de formas de pago (${sumaPagos.toFixed(2)}) debe ser igual al total a pagar (${totalPagar.toFixed(2)}).`
      );
      return false;
    }

    return true;
  }

  private toArticuloDisplay(item: ArticuloPorBodegaDto): string {
    const codigo = String(item.ARTICULO ?? '').trim();
    const descripcion = String(item.DESCRIPCION ?? '').trim();
    return `${codigo} - ${descripcion}`;
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

  private blockEmissionFields() {
    this.facForm.controls.CodGeneracion.disable({ emitEvent: false });
    this.facForm.controls.NoControl.disable({ emitEvent: false });
    this.facForm.controls.SelloRecepcion.disable({ emitEvent: false });
  }

  private resolveCodigoSucursalMh(sucursal: string, puntoVenta: string): string {
    const row = this.sucursalPuntoRows().find((item) => item.Sucursal === sucursal && item.PUNTO_VENTA === puntoVenta);
    return row?.CodigoMHSC || sucursal || 'M001';
  }

  private resolveCodigoPuntoMh(sucursal: string, puntoVenta: string): string {
    const row = this.sucursalPuntoRows().find((item) => item.Sucursal === sucursal && item.PUNTO_VENTA === puntoVenta);
    return row?.codigoMHPV || puntoVenta || 'P001';
  }

  private resolveUnidad(_unidad: string): number {
    return 59;
  }

  private calcIvaItem(item: FacturaDetalleDto): number {
    const totalVenta = this.toNumber(item.TotalVenta || item.TOTAL);
    return Number((totalVenta * 0.12).toFixed(2));
  }

  private generateCodigoGeneracion(): string {
    return crypto.randomUUID().toUpperCase();
  }

  private getAmbiente(): string {
    const ambienteRaw = this.authService.currentUser()?.selectedEmpresa?.ambienteEmision;
    return Number(ambienteRaw) === 0 ? '00' : '01';
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

  private openDteVisualPreview(htmlCompleto: string) {
    const popup = window.open('', '_blank');
    if (!popup) {
      this.showError('Facturación FAC', 'El navegador bloqueó la vista visual del DTE.');
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

  // Ambiente de pruebas: se salta el contacto con Hacienda y va directo al recibo + correo directo.
  // Ambiente de pruebas: el recibo se muestra de inmediato y el correo se envía en segundo
  // plano (si falla se avisa; si no, se asume enviado).
  private registrarFacturaSinDte() {
    const idFactura = this.toNumber(this.facForm.controls.IdFactura.value);
    if (!idFactura) {
      this.showError('Facturación FAC', 'Debe guardar la factura antes de continuar.');
      return;
    }
    const idEmpresa = this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0;
    const datos = this.buildReciboDatosDesdeForm();
    const correoDestino = String(this.facForm.controls.CorreoElectronico?.value ?? '').trim();

    // 1. Recibo al instante + UI liberada + listado actualizado. No esperamos al PDF ni al correo.
    this.emitting.set(false);
    this.openDteVisualPreview(this.reciboService.buildDocumentoVisual(datos));
    this.showInfo('Facturación FAC', 'Factura registrada correctamente.');
    this.loadMaestro();

    // 2. Envío del recibo por correo en segundo plano.
    if (!correoDestino) {
      this.showInfo('Facturación FAC', 'El cliente no tiene correo registrado; el recibo no se envió.');
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
              next: () => this.showInfo('Facturación FAC', 'Recibo enviado por correo.'),
              error: (err) => this.showError('Facturación FAC', this.extractError(err, 'No se pudo enviar el recibo por correo.'))
            });
        })
        .catch(() => this.showError('Facturación FAC', 'No se pudo generar el PDF del recibo para el envío.'));
    }, 50);
  }

  private imprimirRecibo() {
    const datos = this.buildReciboDatosDesdeForm();
    const ok = this.reciboService.imprimirRecibo(datos);
    if (!ok) {
      this.showError('Facturación FAC', 'El navegador bloqueó la vista de la factura. Asegúrese de permitir ventanas emergentes.');
    }
  }

  private formatDateDisplay(value: unknown): string {
    const text = String(value ?? '').trim();
    if (!text) return '—';

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

  // Reenvío directo (sin maildte) para documentos FAC registrados en ambiente de pruebas.
  private enviarReciboDesdeListado(item: FacturaGeneralDto, correoDestino: string): Observable<unknown> {
    const idEmpresa = this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0;
    const idFactura = this.toNumber(item.iddoc);
    const sucursal = String((item as unknown as { CODIGOSUCURSAL?: string; SUCURSAL?: string }).CODIGOSUCURSAL || (item as unknown as { SUCURSAL?: string }).SUCURSAL || '').trim();
    const puntoVenta = String((item as unknown as { PUNTO_VENTA?: string }).PUNTO_VENTA || '').trim();

    return forkJoin({
      encabezado: this.facturacionService.getFacturaEncabezado(item.Prefijo, item.Factura, sucursal, puntoVenta, idEmpresa),
      detalle: this.facturacionService.getFacturaDetalle(item.Prefijo, item.Factura, sucursal, puntoVenta, 'FAC')
    }).pipe(
      switchMap(({ encabezado, detalle }) => {
        const datos = this.buildReciboDatos(encabezado as unknown as Record<string, unknown>, detalle ?? [], false);
        return this.reciboService.generarReciboPdfBase64(datos).then((pdfBase64) => pdfBase64);
      }),
      switchMap((pdfBase64) =>
        this.facturacionService.enviarReciboDirecto(idEmpresa, idFactura, 'FAC', correoDestino, pdfBase64, `Recibo_${idFactura}.pdf`)
      )
    );
  }

  private setStep(key: string, status: EmisionStep['status'], detail?: string) {
    this.emisionSteps.update((steps) =>
      steps.map((step) => (step.key === key ? { ...step, status, detail } : step))
    );
  }

  private showInfo(summary: string, detail: string) {
    this.messageService.add({ severity: 'info', summary, detail });
  }

  private showError(summary: string, detail: string) {
    this.messageService.add({ severity: 'error', summary, detail });
  }

  private extractError(error: unknown, fallback: string): string {
    if (typeof error === 'string') {
      return this.sanitizeBackendErrorMessage(error) || fallback;
    }

    const maybe = error as { error?: unknown; message?: string };
    const fromError = maybe?.error;

    if (typeof fromError === 'string' && fromError.trim()) {
      return this.sanitizeBackendErrorMessage(fromError) || fallback;
    }

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

    if (typeof maybe?.message === 'string' && maybe.message.trim()) {
      return this.sanitizeBackendErrorMessage(maybe.message) || fallback;
    }

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

  private buildFacturacionAplicacionPayloadFromFactura(item: FacturaGeneralDto, tipoMtto: 'Aplicar' | 'Desaplicar'): UpdateFacturacionAplicacionDto {
    return {
      CodGeneracion: String(item.CodGeneracion ?? '').trim(),
      Sucursal: this.resolveSucursalCodigoFromFactura(item),
      PuntoVenta: String(item.PUNTO_VENTA ?? '').trim(),
      TipoFactura: String(item.Tipo_Factura ?? 'FAC').trim() || 'FAC',
      Usuario: String(this.authService.currentUser()?.username ?? '').trim(),
      IdEmpresa: this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0,
      TipoMtto: tipoMtto
    };
  }

  private executeDesaplicarForDelete(item: FacturaGeneralDto): Observable<unknown> {
    const payload = this.buildFacturacionAplicacionPayloadFromFactura(item, 'Desaplicar');
    return this.facturacionService.updateFacturacionAplicacion(payload);
  }

  private shouldRetryDeleteAfterDesaplicar(error: unknown): boolean {
    const message = this.extractError(error, '').toLowerCase();
    return message.includes('factura esta aplicada no se puede modificar o eliminar');
  }

  private resolveFacturaGeneralDate(value: unknown): string {
    const raw = String(value ?? '').trim();
    if (!raw) {
      return this.formatDateInput(new Date());
    }

    const datePart = raw.split(' ')[0];
    const normalized = this.normalizeFilterDate(datePart);
    if (normalized) {
      return normalized;
    }

    return this.formatDateInput(raw);
  }

  private resolveSucursalCodigoFromFactura(item: FacturaGeneralDto): string {
    const codigo = String(item.CODIGOSUCURSAL ?? '').trim();
    if (codigo) {
      return codigo;
    }

    return String(item.SUCURSAL ?? '').trim();
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
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }

  private formatDateInput(value: Date | string): string {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return this.formatDateInput(new Date());
    }

    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private startOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  private toNumber(value: unknown): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

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
    const totalAPagarAntesRet = this.roundAmount(
      rows.reduce((acc, row) => acc + this.toNumber(row.TotalVenta || row.TOTAL), 0)
    );
    const iva = this.roundAmount(totalAPagarAntesRet * (0.13 / 1.13));
    const sumas = this.roundAmount(totalAPagarAntesRet - iva);
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
    const normalized = this.normalizeFacturaTotals({
      sumas: this.toNumber(totales.SUMAS),
      descuentos: this.resolveDescuentosFromTotales(totales),
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

  private normalizeFacturaTotals(source: {
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

  private numberToSimpleWords(value: number): string {
    const rounded = Number(value.toFixed(2));
    const integerPart = Math.floor(rounded);
    const decimalPart = Math.round((rounded - integerPart) * 100);
    return `${integerPart} CON ${String(decimalPart).padStart(2, '0')}/100 DÓLARES`;
  }
}
