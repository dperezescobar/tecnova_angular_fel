import {
  ChangeDetectionStrategy, Component, ViewChild, computed, inject, OnInit, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageModule } from 'primeng/message';
import { TagModule } from 'primeng/tag';
import { TabsModule } from 'primeng/tabs';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';

import { CompDonacionService } from '../services/comp-donacion.service';
import { FacturacionService } from '../../facturacion/services/facturacion';
import { AuthService } from '../../../core/services/auth';
import {
  CDListadoDto, CDEncabezadoDto, CDDetalleDto,
  CDSaveDto, CDDetalleSaveDto, CDDetalleDeleteDto,
  CDAplicarDto, CDAnularDto, CDFormaPagoDto,
  TipoDonacionDto, FormaPagoDocDto,
} from '../../../core/models/comprobantes.models';
import {
  PerfilClienteDto, ParametrosDteDto, VerificarSecuenciasDto,
} from '../../../core/models/facturacion.models';
import { environment } from '../../../../environments/environment';
import { ReenviarCorreoDialogComponent } from '../../../shared/components/reenviar-correo-dialog/reenviar-correo-dialog';
import { EliminarConfirmDialogComponent } from '../../../shared/components/eliminar-confirm-dialog/eliminar-confirm-dialog';

@Component({
  selector: 'app-comp-donacion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    ButtonModule,
    CardModule,
    InputTextModule,
    SelectModule,
    AutoCompleteModule,
    ProgressSpinnerModule,
    MessageModule,
    TagModule,
    TabsModule,
    DialogModule,
    ToastModule,
    ReenviarCorreoDialogComponent,
    EliminarConfirmDialogComponent,
  ],
  providers: [MessageService],
  templateUrl: './comp-donacion.html',
  styleUrls: ['./comp-donacion.scss'],
})
export class CompDonacionComponent implements OnInit {
  @ViewChild(ReenviarCorreoDialogComponent) reenviarCorreoDialog!: ReenviarCorreoDialogComponent;
  @ViewChild(EliminarConfirmDialogComponent) eliminarConfirmDialog!: EliminarConfirmDialogComponent;

  private fb = inject(FormBuilder);
  private service = inject(CompDonacionService);
  private facturacionService = inject(FacturacionService);
  private authService = inject(AuthService);

  loading = signal(false);
  saving = signal(false);
  loadingDetalle = signal(false);
  addingDetalle = signal(false);
  emitting = signal(false);
  anulando = signal(false);
  aplicando = signal(false);

  listado = signal<CDListadoDto[]>([]);
  showForm = signal(false);
  encabezado = signal<CDEncabezadoDto | null>(null);
  detalle = signal<CDDetalleDto[]>([]);
  formasPago = signal<FormaPagoDocDto[]>([]);
  clientePerfil = signal<PerfilClienteDto | null>(null);
  clienteSugerencias = signal<Record<string, unknown>[]>([]);
  tipoDonacionOpts = signal<TipoDonacionDto[]>([]);
  articulosOpts = signal<{ label: string; value: string }[]>([]);
  unidadesOpts = signal<{ label: string; value: string }[]>([]);
  formasPagoCatOpts = signal<{ label: string; value: string }[]>([]);

  errorMessage = signal('');
  errorDetalle = signal('');
  errorFP = signal('');
  activeTab = signal('encabezado');
  anulacionDialogVisible = signal(false);
  anulacionMotivo = signal('');

  filterDesde = signal(this.defaultDesde());
  filterHasta = signal(this.defaultHasta());
  filterText = signal('');

  readonly pageSize = 20;
  currentPage = signal(1);
  totalPages = computed(() => Math.max(1, Math.ceil(this.listado().length / this.pageSize)));
  pagedListado = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.listado().slice(start, start + this.pageSize);
  });
  pageInfo = computed(() => ({
    start: this.listado().length === 0 ? 0 : (this.currentPage() - 1) * this.pageSize + 1,
    end: Math.min(this.currentPage() * this.pageSize, this.listado().length),
    total: this.listado().length,
  }));

  estado = computed(() => this.encabezado()?.Estado ?? '');
  isNuevo = computed(() => !this.encabezado());
  canEdit = computed(() => !this.encabezado() || this.estado() === 'ELABORACION');
  canAddDetalle = computed(() => !!this.encabezado()?.PREFIJO && this.estado() === 'ELABORACION');
  canEmit = computed(() => this.estado() === 'ELABORACION' && this.detalle().length > 0);
  canAplicar = computed(() => this.estado() === 'ELABORACION');
  canDesaplicar = computed(() => this.estado() === 'APLICADO');
  canAnular = computed(() => this.estado() === 'ELABORACION' || this.estado() === 'APLICADO' || this.estado() === 'EMITIDO');
  isEmitido = computed(() => this.estado() === 'EMITIDO');
  isAnulado = computed(() => this.estado() === 'ANULADO');

  headerForm = this.fb.group({
    PREFIJO: [''],
    FACTURA: [''],
    CLIENTE: ['', Validators.required],
    CLIENTE_DISPLAY: [''],
    FACTURAR_A: [''],
    FECHA: [this.defaultHasta(), Validators.required],
    CONDICION_PAGO: ['VCP000'],
    OBSERVACIONES: [''],
    NIT: [''],
    NRC: [''],
    CorreoCliente: [''],
    codDocAsociado: [''],
    descDocumento: [''],
    detalleDocumento: [''],
    idFactura: [0],
    SubTotal: [0],
  });

  detalleForm = this.fb.group({
    TipoDonacion: [null as number | null, Validators.required],
    Articulo: ['', Validators.required],
    Descripcion: [''],
    Unidad_Medida: ['', Validators.required],
    Cantidad: [null as number | null, Validators.required],
    PrecioUnitario: [null as number | null, Validators.required],
    Depreciacion: [0],
    Linea: [0],
  });

  fpMonto = signal(0);
  fpCodigo = signal('');

  private defaultDesde(): string {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().substring(0, 10);
  }

  private defaultHasta(): string {
    return new Date().toISOString().substring(0, 10);
  }

  private getAmbiente(): string {
    return Number(this.authService.currentUser()?.selectedEmpresa?.ambienteEmision) === 0 ? '00' : '01';
  }

  private getMailDteUrl(): string {
    return environment.production ? 'https://maildte.kulstoresv.com' : '/maildte-proxy';
  }

  ngOnInit(): void { this.loadListado(); }

  goToPage(n: number): void { this.currentPage.set(Math.max(1, Math.min(n, this.totalPages()))); }
  prevPage(): void { this.goToPage(this.currentPage() - 1); }
  nextPage(): void { this.goToPage(this.currentPage() + 1); }

  loadListado(): void {
    this.loading.set(true);
    this.errorMessage.set('');
    this.currentPage.set(1);
    this.service.getListado(this.filterDesde(), this.filterHasta(), this.filterText())
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (data) => this.listado.set(data ?? []),
        error: () => this.errorMessage.set('Error al cargar el listado.'),
      });
  }

  openCreateForm(): void {
    const guid = crypto.randomUUID().toUpperCase();
    const prefijo = guid.substring(0, 18);
    const factura = guid.substring(18);
    this.encabezado.set(null);
    this.detalle.set([]);
    this.formasPago.set([]);
    this.clientePerfil.set(null);
    this.errorMessage.set('');
    this.errorDetalle.set('');
    this.activeTab.set('encabezado');
    this.headerForm.reset({
      PREFIJO: prefijo,
      FACTURA: factura,
      CLIENTE: '',
      CLIENTE_DISPLAY: '',
      FACTURAR_A: '',
      FECHA: this.defaultHasta(),
      CONDICION_PAGO: 'VCP000',
      OBSERVACIONES: '',
      NIT: '',
      NRC: '',
      CorreoCliente: '',
      codDocAsociado: '',
      descDocumento: '',
      detalleDocumento: '',
      idFactura: 0,
      SubTotal: 0,
    });
    this.detalleForm.reset({ Depreciacion: 0, Linea: 0 });
    this.loadCatalogs();
    this.showForm.set(true);
  }

  openEditForm(item: CDListadoDto): void {
    this.loading.set(true);
    this.encabezado.set(null);
    this.detalle.set([]);
    this.formasPago.set([]);
    this.clientePerfil.set(null);
    this.errorMessage.set('');
    this.errorDetalle.set('');
    this.activeTab.set('encabezado');
    this.service.getCDById(item.idFactura)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (enc) => {
          if (!enc) { this.errorMessage.set('No se encontró el comprobante.'); return; }
          this.encabezado.set(enc);
          this.headerForm.patchValue({
            PREFIJO: enc.PREFIJO,
            FACTURA: enc.FACTURA,
            CLIENTE: enc.CLIENTE,
            CLIENTE_DISPLAY: enc.FACTURAR_A || enc.CLIENTE,
            FACTURAR_A: enc.FACTURAR_A,
            FECHA: enc.FECHA?.substring(0, 10),
            CONDICION_PAGO: enc.CONDICION_PAGO,
            OBSERVACIONES: enc.OBSERVACIONES,
            NIT: enc.NIT,
            NRC: enc.NRC,
            CorreoCliente: '',
            codDocAsociado: enc.codDocAsociado,
            descDocumento: enc.descDocumento,
            detalleDocumento: enc.detalleDocumento,
            idFactura: enc.idFactura,
            SubTotal: enc.TOTAL_FACTURA,
          });
          this.loadCatalogs();
          this.loadDetalle();
          this.loadFormasPago();
          if (enc.CLIENTE) this.loadPerfilCliente(enc.CLIENTE);
          this.showForm.set(true);
        },
        error: () => this.errorMessage.set('Error al cargar el comprobante.'),
      });
  }

  closeForm(): void {
    this.showForm.set(false);
    this.encabezado.set(null);
    this.listado.set([]);
    this.loadListado();
  }

  saveHeader(): void {
    if (this.headerForm.invalid) {
      this.errorMessage.set('Complete los campos requeridos.');
      return;
    }
    const v = this.headerForm.getRawValue();
    const isNew = !this.encabezado();
    const dto: CDSaveDto = {
      PREFIJO: v.PREFIJO ?? '',
      FACTURA: v.FACTURA ?? '',
      CLIENTE: v.CLIENTE ?? '',
      FACTURAR_A: v.FACTURAR_A ?? '',
      FECHA: v.FECHA ?? '',
      CONDICION_PAGO: v.CONDICION_PAGO ?? 'VCP000',
      OBSERVACIONES: v.OBSERVACIONES ?? '',
      TipoMtto: isNew ? 'A' : 'C',
      SubTotal: Number(v.SubTotal ?? 0),
      NIT: v.NIT ?? '',
      Registro_Comercio: v.NRC ?? '',
      CorreoCliente: v.CorreoCliente ?? '',
      codDocAsociado: v.codDocAsociado ?? '',
      descDocumento: v.descDocumento ?? '',
      detalleDocumento: v.detalleDocumento ?? '',
    };
    this.saving.set(true);
    this.errorMessage.set('');
    this.service.saveCD(dto)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          const reload$ = (v.idFactura && v.idFactura > 0)
            ? this.service.getCDById(v.idFactura)
            : this.service.getCDByPrefijoFactura(v.PREFIJO ?? '', v.FACTURA ?? '');
          reload$.subscribe({
            next: (enc) => {
              if (enc) {
                this.encabezado.set(enc);
                this.headerForm.patchValue({ idFactura: enc.idFactura, SubTotal: enc.TOTAL_FACTURA });
              }
            },
          });
        },
        error: (err) => this.errorMessage.set(`Error al guardar: ${err?.error ?? err?.message ?? 'Error'}`),
      });
  }

  private loadCatalogs(): void {
    if (!this.tipoDonacionOpts().length) {
      this.service.getTipoDonacion().subscribe({
        next: (rows) => this.tipoDonacionOpts.set(rows ?? []),
        error: () => {},
      });
    }
    if (!this.articulosOpts().length) {
      this.service.getArticulos().subscribe({
        next: (rows) => this.articulosOpts.set(
          (rows ?? []).map(r => ({
            value: String((r as any).ARTICULO ?? (r as any).articulo ?? ''),
            label: String((r as any).DESCRIPCION ?? (r as any).descripcion ?? ''),
          }))
        ),
        error: () => {},
      });
    }
    if (!this.formasPagoCatOpts().length) {
      this.service.getFormasPagoCatalogo().subscribe({
        next: (rows) => this.formasPagoCatOpts.set(
          (rows ?? []).map(r => ({
            value: String((r as any).codigo ?? (r as any).CODIGO ?? ''),
            label: String((r as any).Descripcion ?? (r as any).DESCRIPCION ?? ''),
          }))
        ),
        error: () => {},
      });
    }
  }

  private loadPerfilCliente(codigo: string): void {
    this.service.getPerfilCliente(codigo).subscribe({
      next: (p) => { if (p) this.clientePerfil.set(p); },
      error: () => {},
    });
  }

  private loadDetalle(): void {
    const v = this.headerForm.getRawValue();
    if (!v.PREFIJO) return;
    this.loadingDetalle.set(true);
    this.service.getDetalle(v.PREFIJO, v.FACTURA ?? '')
      .pipe(finalize(() => this.loadingDetalle.set(false)))
      .subscribe({
        next: (rows) => this.detalle.set(rows ?? []),
        error: () => this.errorDetalle.set('Error al cargar el detalle.'),
      });
  }

  private loadFormasPago(): void {
    const idFactura = this.encabezado()?.idFactura ?? this.headerForm.getRawValue().idFactura;
    if (!idFactura) return;
    this.service.getFormasPago(Number(idFactura)).subscribe({
      next: (rows) => this.formasPago.set(rows ?? []),
      error: () => {},
    });
  }

  buscarClientes(query: string): void {
    if (!query?.trim()) { this.clienteSugerencias.set([]); return; }
    this.service.searchClientes(query).subscribe({
      next: (data) => this.clienteSugerencias.set(data ?? []),
      error: () => this.clienteSugerencias.set([]),
    });
  }

  onClienteSelected(item: Record<string, unknown>): void {
    const codigo = String((item as any).CLIENTE ?? (item as any).cliente ?? '');
    const nombre = String((item as any).NOMBRE ?? (item as any).nombre ?? (item as any).FACTURAR_A ?? '');
    this.headerForm.patchValue({ CLIENTE: codigo, CLIENTE_DISPLAY: nombre, FACTURAR_A: nombre });
    this.loadPerfilCliente(codigo);
  }

  onArticuloChange(articulo: string): void {
    if (!articulo) return;
    this.service.getUnidadesMedida(articulo).subscribe({
      next: (rows) => this.unidadesOpts.set(
        (rows ?? []).map(r => ({
          value: String((r as any).UNIDAD_MEDIDA ?? (r as any).unidad_medida ?? ''),
          label: String((r as any).DESCRIPCION ?? (r as any).descripcion ?? ''),
        }))
      ),
      error: () => {},
    });
  }

  addDetalle(): void {
    if (this.detalleForm.invalid) {
      this.errorDetalle.set('Complete todos los campos del detalle.');
      return;
    }
    const v = this.detalleForm.getRawValue();
    const hv = this.headerForm.getRawValue();
    const subtotal = Number(this.encabezado()?.TOTAL_FACTURA ?? hv.SubTotal ?? 0);
    const dto: CDDetalleSaveDto = {
      PREFIJO: hv.PREFIJO ?? '',
      FACTURA: hv.FACTURA ?? '',
      Cantidad: Number(v.Cantidad ?? 0),
      Articulo: v.Articulo ?? '',
      Descripcion: v.Descripcion ?? '',
      PrecioUnitario: Number(v.PrecioUnitario ?? 0),
      Unidad_Medida: v.Unidad_Medida ?? '',
      Linea: Number(v.Linea ?? 0),
      SubTotal: subtotal,
      TipoDonacion: Number(v.TipoDonacion ?? 0),
      Depreciacion: Number(v.Depreciacion ?? 0),
    };
    this.addingDetalle.set(true);
    this.errorDetalle.set('');
    this.service.addDetalle(dto)
      .pipe(finalize(() => this.addingDetalle.set(false)))
      .subscribe({
        next: () => {
          this.detalleForm.reset({ Depreciacion: 0, Linea: 0 });
          this.loadDetalle();
          this.reloadEncabezado();
        },
        error: (err) => this.errorDetalle.set(`Error: ${err?.error ?? 'Error inesperado'}`),
      });
  }

  deleteDetalle(row: CDDetalleDto): void {
    const hv = this.headerForm.getRawValue();
    const subtotal = Number(this.encabezado()?.TOTAL_FACTURA ?? 0);
    const dto: CDDetalleDeleteDto = {
      PREFIJO: hv.PREFIJO ?? '',
      FACTURA: hv.FACTURA ?? '',
      LINEA: Number(row.ID ?? 0),
      SubTotal: subtotal,
    };
    this.service.deleteDetalle(dto).subscribe({
      next: () => { this.loadDetalle(); this.reloadEncabezado(); },
      error: (err) => this.errorDetalle.set(`Error: ${err?.error ?? 'Error inesperado'}`),
    });
  }

  addFormaPago(): void {
    const idFactura = this.encabezado()?.idFactura;
    if (!idFactura || !this.fpCodigo() || this.fpMonto() <= 0) return;
    const dto: CDFormaPagoDto = { idFactura, codigo: this.fpCodigo(), Monto: this.fpMonto(), TipoMtto: 'A' };
    this.service.updateFormaPago(dto).subscribe({
      next: () => { this.fpMonto.set(0); this.fpCodigo.set(''); this.loadFormasPago(); },
      error: (err) => this.errorFP.set(`Error: ${err?.error ?? ''}`),
    });
  }

  deleteFormaPago(fp: FormaPagoDocDto): void {
    const idFactura = this.encabezado()?.idFactura;
    if (!idFactura) return;
    const dto: CDFormaPagoDto = { idFactura, codigo: fp.CODIGO, Monto: fp.MONTO, TipoMtto: 'B' };
    this.service.updateFormaPago(dto).subscribe({
      next: () => this.loadFormasPago(),
      error: (err) => this.errorFP.set(`Error: ${err?.error ?? ''}`),
    });
  }

  aplicar(aplicar: boolean): void {
    const enc = this.encabezado();
    if (!enc) return;
    const dto: CDAplicarDto = { PREFIJO: enc.PREFIJO, FACTURA: enc.FACTURA, Aplicar: aplicar };
    this.aplicando.set(true);
    this.service.aplicar(dto)
      .pipe(finalize(() => this.aplicando.set(false)))
      .subscribe({
        next: () => this.reloadEncabezado(),
        error: (err) => this.errorMessage.set(`Error: ${err?.error ?? 'Error'}`),
      });
  }

  emitirDTE(): void {
    const idEmpresa = this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0;
    const username = this.authService.currentUser()?.username ?? '';
    const ambiente = this.getAmbiente();
    const seqDto: VerificarSecuenciasDto = {
      IdEmpresa: idEmpresa,
      AmbienteEmision: ambiente,
      TipoFactura: 'CD',
      TipoDoc: '15',
    };

    this.emitting.set(true);
    this.errorMessage.set('');
    this.facturacionService.verificarSecuencias(seqDto)
      .subscribe({
        next: () => {
          const enc = this.encabezado();
          const payload: ParametrosDteDto = {
            idFactura: enc?.idFactura ?? 0,
            idEmpresa,
            ambiente,
            codEstablecimiento: 'M001',
            codPuntoVenta: 'P001',
            user: username,
          };
          this.facturacionService.emitirDte(this.getMailDteUrl(), payload, 'CD')
            .pipe(finalize(() => this.emitting.set(false)))
            .subscribe({
              next: (res) => {
                if (res.SelloRecepcion) {
                  this.reloadEncabezado();
                } else {
                  this.errorMessage.set(res.MensajeGeneral ?? 'Error al emitir DTE.');
                }
              },
              error: (err) => this.errorMessage.set(`Error DTE: ${err?.error ?? 'Error inesperado'}`),
            });
        },
        error: (err) => {
          this.emitting.set(false);
          this.errorMessage.set(`Secuencias: ${err?.error?.message ?? err?.message ?? 'Error'}`);
        },
      });
  }

  openAnulacion(): void {
    this.anulacionMotivo.set('');
    this.anulacionDialogVisible.set(true);
  }

  confirmarAnulacion(): void {
    if (!this.anulacionMotivo().trim()) return;
    const enc = this.encabezado();
    if (!enc) return;
    const dto: CDAnularDto = { idFactura: enc.idFactura, ComentarioAnulacion: this.anulacionMotivo() };
    this.anulando.set(true);
    this.service.anular(dto)
      .pipe(finalize(() => this.anulando.set(false)))
      .subscribe({
        next: () => { this.anulacionDialogVisible.set(false); this.reloadEncabezado(); },
        error: (err) => this.errorMessage.set(`Error: ${err?.error ?? 'Error inesperado'}`),
      });
  }

  solicitarEliminarCD(item: CDListadoDto): void {
    this.eliminarConfirmDialog.abrir(() => this.deleteCD(item));
  }

  deleteCD(item: CDListadoDto): void {
    this.service.deleteCD(item.idFactura).subscribe({
      next: () => this.loadListado(),
      error: (err) => this.errorMessage.set(`Error: ${err?.error ?? ''}`),
    });
  }

  onReenviarCorreo(item: CDListadoDto): void {
    const idEmpresa = this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0;
    const idFactura = item.idFactura;
    this.service.getPerfilCliente(item.CLIENTE).subscribe({
      next: (perfil) => {
        const correoDefault = String(perfil?.CORREO_ELECTRONICO ?? '').trim();
        this.reenviarCorreoDialog.abrir(idEmpresa, idFactura, 'CD', correoDefault);
      },
      error: () => this.reenviarCorreoDialog.abrir(idEmpresa, idFactura, 'CD', ''),
    });
  }

  verComprobante(): void {
    const enc = this.encabezado();
    if (!enc) return;
    const idEmpresa = this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0;
    const url = this.facturacionService.getPreviewDteUrl(idEmpresa, enc.idFactura, 'CD', !!enc.SelloRecepcion);
    window.open(url, '_blank');
  }

  private reloadEncabezado(): void {
    const enc = this.encabezado();
    if (!enc) return;
    this.service.getCDById(enc.idFactura).subscribe({
      next: (updated) => {
        if (updated) {
          this.encabezado.set(updated);
          this.headerForm.patchValue({ SubTotal: updated.TOTAL_FACTURA });
        }
      },
    });
  }

  estadoSeverity(estado: string): 'success' | 'warn' | 'danger' | 'secondary' | 'info' {
    switch (estado?.toUpperCase()) {
      case 'EMITIDO': return 'success';
      case 'APLICADO': return 'warn';
      case 'ELABORACION': return 'info';
      case 'ANULADO': return 'danger';
      default: return 'secondary';
    }
  }

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-SV', { style: 'currency', currency: 'USD' }).format(v ?? 0);
  }
}
