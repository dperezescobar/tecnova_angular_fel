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
import { CheckboxModule } from 'primeng/checkbox';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TableModule } from 'primeng/table';

import { CompRetencionService } from '../services/comp-retencion.service';
import { FacturacionService } from '../../facturacion/services/facturacion';
import { AuthService } from '../../../core/services/auth';
import {
  CRListadoDto, CREncabezadoDto, CRDetalleDto,
  CRSaveDto, CRDetalleSaveDto, CRDetalleDeleteDto,
  PerfilProveedorDto, ProveedorBusquedaDto,
} from '../../../core/models/comprobantes.models';
import { ParametrosDteDto, VerificarSecuenciasDto } from '../../../core/models/facturacion.models';
import { environment } from '../../../../environments/environment';
import { ReenviarCorreoDialogComponent } from '../../../shared/components/reenviar-correo-dialog/reenviar-correo-dialog';
import { EliminarConfirmDialogComponent } from '../../../shared/components/eliminar-confirm-dialog/eliminar-confirm-dialog';

@Component({
  selector: 'app-comp-retencion',
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
    CheckboxModule,
    ToastModule,
    TableModule,
    ReenviarCorreoDialogComponent,
    EliminarConfirmDialogComponent,
  ],
  providers: [MessageService],
  templateUrl: './comp-retencion.html',
  styleUrls: ['./comp-retencion.scss'],
})
export class CompRetencionComponent implements OnInit {
  @ViewChild(ReenviarCorreoDialogComponent) reenviarCorreoDialog!: ReenviarCorreoDialogComponent;
  @ViewChild(EliminarConfirmDialogComponent) eliminarConfirmDialog!: EliminarConfirmDialogComponent;

  private fb = inject(FormBuilder);
  private service = inject(CompRetencionService);
  private facturacionService = inject(FacturacionService);
  private authService = inject(AuthService);
  private messageService = inject(MessageService);

  loading = signal(false);
  saving = signal(false);
  loadingDetalle = signal(false);
  addingDetalle = signal(false);
  emitting = signal(false);
  anulando = signal(false);
  proveedorSearchVisible = signal(false);
  proveedorSearchList = signal<ProveedorBusquedaDto[]>([]);
  proveedorSearchTerm = signal('');
  searchingProveedor = signal(false);

  listado = signal<CRListadoDto[]>([]);
  showForm = signal(false);
  encabezado = signal<CREncabezadoDto | null>(null);
  correl = signal(0);
  detalle = signal<CRDetalleDto[]>([]);
  totalRetencion = signal(0);
  proveedorPerfil = signal<PerfilProveedorDto | null>(null);
  proveedorSugerencias = signal<ProveedorBusquedaDto[]>([]);

  errorMessage = signal('');
  errorDetalle = signal('');
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

  tipoDocOptions = [
    { label: 'CF - Consumidor Final (01)', value: '01' },
    { label: 'CCF - Crédito Fiscal (03)', value: '03' },
  ];

  normalizedEstado = computed(() => this.normalizeEstadoValue(this.encabezado()?.ESTADO));
  estado = computed(() => this.encabezado()?.ESTADO ?? '');
  isNuevo = computed(() => !this.encabezado() || this.correl() === 0);
  canEdit = computed(() => (this.isNuevo() || this.normalizedEstado() === 'ELABORACION') && !this.encabezado()?.SelloRecepcion);
  canAddDetalle = computed(() => this.correl() > 0 && this.canEdit());
  
  // Emitir DTE sólo si el documento existe, no está anulado Y AÚN NO ha sido emitido (sin sello ni código generación)
  canEmit = computed(() => {
    if (this.correl() <= 0) return false;
    if (this.normalizedEstado() === 'ANULADO') return false;
    const enc = this.encabezado();
    if (enc?.SelloRecepcion || enc?.CodGeneracion || enc?.CodigoGeneracion) return false;
    return true;
  });

  isEmitido = computed(() => {
    const enc = this.encabezado();
    return !!(enc?.SelloRecepcion || enc?.CodGeneracion || enc?.CodigoGeneracion || this.normalizedEstado() === 'APLICADO');
  });

  canAnular = computed(() => this.correl() > 0 && this.normalizedEstado() !== 'ANULADO');
  isAnulado = computed(() => this.normalizedEstado() === 'ANULADO');
  canEmitNC = computed(() => this.isEmitido() && !this.isAnulado());
  totalLetras = computed(() => this.numberToSimpleWords(this.totalRetencion()));

  headerForm = this.fb.group({
    COMPROBANTE: [''],
    PROVEEDOR: ['', Validators.required],
    PROVEEDOR_DISPLAY: [''],
    FECHA: [this.defaultHasta(), Validators.required],
    FECHA_COMPROBANTE: [this.defaultHasta(), Validators.required],
    OBSERVACION: [''],
    CONDICION_PAGO: ['VCP000'],
    NUMERO_RESOLUCION: [''],
    ID: [0],
  });

  detalleForm = this.fb.group({
    TIPO_DOC: ['03'],
    esDTE: [true],
    SERIE: [''],
    NUMERO: [''],
    COD_GENERACION: [''],
    SELLO_RECEPCION: [''],
    MONTO: [null as number | null, Validators.required],
    DESCRIPCION: [''],
    FECHA_DOC: [this.defaultHasta()],
    PORC_RETENCION: [1],
  });

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

  ngOnInit(): void {
    this.loadListado();
  }

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
    this.encabezado.set(null);
    this.correl.set(0);
    this.detalle.set([]);
    this.totalRetencion.set(0);
    this.proveedorPerfil.set(null);
    this.errorMessage.set('');
    this.errorDetalle.set('');
    this.headerForm.reset({
      COMPROBANTE: guid,
      PROVEEDOR: '',
      PROVEEDOR_DISPLAY: '',
      FECHA: this.defaultHasta(),
      FECHA_COMPROBANTE: this.defaultHasta(),
      OBSERVACION: '',
      CONDICION_PAGO: 'VCP000',
      NUMERO_RESOLUCION: '',
      ID: 0,
    });
    this.detalleForm.reset({ TIPO_DOC: '03', esDTE: true, PORC_RETENCION: 1 });
    this.showForm.set(true);
  }

  private parseFechaDDMMYYYY(fechaStr?: string): string {
    if (!fechaStr) return '';
    const datePart = fechaStr.substring(0, 10);
    const parts = datePart.split('/');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return datePart;
  }

  openEditForm(item: CRListadoDto): void {
    this.loading.set(true);
    this.encabezado.set(null);
    this.detalle.set([]);
    this.proveedorPerfil.set(null);
    this.errorMessage.set('');
    this.errorDetalle.set('');
    this.service.getCRById(item.ID)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (enc) => {
          if (!enc) { this.errorMessage.set('No se encontró el comprobante.'); return; }
          this.encabezado.set(enc);
          this.correl.set(enc.ID ?? enc.CORREL);
          this.headerForm.patchValue({
            COMPROBANTE: enc.COMPROBANTE,
            PROVEEDOR: enc.PROVEEDOR,
            PROVEEDOR_DISPLAY: { NOMBRE: enc.NOMBRE } as any,
            FECHA: this.parseFechaDDMMYYYY(enc.FECHA),
            FECHA_COMPROBANTE: enc.FECHA_COMPROBANTE?.substring(0, 10),
            OBSERVACION: enc.OBSERVACION,
            CONDICION_PAGO: enc.CONDICION_PAGO,
            NUMERO_RESOLUCION: enc.NUMERO_RESOLUCION,
            ID: enc.ID ?? enc.CORREL,
          });
          this.loadPerfilProveedor(enc.PROVEEDOR);
          this.loadDetalle();
          this.showForm.set(true);
        },
        error: () => this.errorMessage.set('Error al cargar el comprobante.'),
      });
  }

  closeForm(): void {
    this.showForm.set(false);
    this.encabezado.set(null);
    this.correl.set(0);
    this.listado.set([]);
    this.loadListado();
  }

  saveHeader(): void {
    if (this.headerForm.invalid) {
      this.errorMessage.set('Complete los campos requeridos: Proveedor y Fechas.');
      return;
    }
    const v = this.headerForm.getRawValue();
    const dto: CRSaveDto = {
      COMPROBANTE: v.COMPROBANTE ?? '',
      PROVEEDOR: v.PROVEEDOR ?? '',
      FECHA: v.FECHA ?? '',
      FECHA_COMPROBANTE: v.FECHA_COMPROBANTE ?? v.FECHA ?? '',
      OBSERVACION: v.OBSERVACION ?? '',
      CONDICION_PAGO: v.CONDICION_PAGO ?? 'VCP000',
      NUMERO_RESOLUCION: v.NUMERO_RESOLUCION ?? '',
      ID: v.ID ?? 0,
    };
    this.saving.set(true);
    this.errorMessage.set('');
    this.service.saveCR(dto)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (res) => {
          const newCorrel = res.ID;
          this.correl.set(newCorrel);
          this.headerForm.patchValue({ ID: newCorrel });
          this.service.getCRById(newCorrel).subscribe({
            next: (enc) => {
              if (enc) this.encabezado.set(enc);
            },
          });
        },
        error: (err) => this.errorMessage.set(`Error al guardar: ${err?.error ?? err?.message ?? 'Error inesperado'}`),
      });
  }

  private loadPerfilProveedor(codigo: string): void {
    this.service.getPerfilProveedor(codigo).subscribe({
      next: (p) => this.proveedorPerfil.set(p),
      error: () => {},
    });
  }

  private loadDetalle(): void {
    const v = this.headerForm.getRawValue();
    if (!this.correl()) return;
    this.loadingDetalle.set(true);
    this.service.getDetalle(this.correl(), v.COMPROBANTE ?? '', v.PROVEEDOR ?? '', v.FECHA ?? '')
      .pipe(finalize(() => this.loadingDetalle.set(false)))
      .subscribe({
        next: (rows) => {
          this.detalle.set(rows ?? []);
          const total = rows?.[0]?.TotalRetencion ?? 0;
          this.totalRetencion.set(Number(total));
        },
        error: () => this.errorDetalle.set('Error al cargar el detalle.'),
      });
  }

  onBuscarProveedorModal(): void {
    const query = this.proveedorSearchTerm().trim();
    if (!query || query.length < 3) {
        this.messageService.add({ severity: 'warn', summary: 'Atención', detail: 'Ingrese al menos 3 caracteres para buscar.' });
        return;
    }
    
    this.searchingProveedor.set(true);
    this.service.searchProveedores(query)
      .pipe(finalize(() => this.searchingProveedor.set(false)))
      .subscribe({
        next: (res) => {
          if (res.length === 1) {
            this.seleccionarProveedorModal(res[0]);
          } else if (res.length > 1) {
            this.proveedorSearchList.set(res);
            this.proveedorSearchVisible.set(true);
          } else {
            this.messageService.add({ severity: 'info', summary: 'Sin resultados', detail: 'No se encontraron proveedores.' });
          }
        },
        error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Falló la búsqueda de proveedores.' })
      });
  }

  seleccionarProveedorModal(p: ProveedorBusquedaDto): void {
    this.proveedorSearchVisible.set(false);
    this.onProveedorSelected(p);
  }

  buscarProveedores(query: string): void {
    if (!query?.trim()) { this.proveedorSugerencias.set([]); return; }
    this.service.searchProveedores(query).subscribe({
      next: (data) => this.proveedorSugerencias.set(
        (data ?? []).map(r => ({
          PROVEEDOR: String((r as any).PROVEEDOR ?? ''),
          NOMBRE: String((r as any).NOMBRE ?? (r as any).NOMBRE_RAZON_SOCIAL ?? ''),
          NIT: String((r as any).NIT ?? ''),
        }))
      ),
      error: () => this.proveedorSugerencias.set([]),
    });
  }

  onProveedorSelected(item: ProveedorBusquedaDto): void {
    this.headerForm.patchValue({
      PROVEEDOR: item.PROVEEDOR,
    });
    this.loadPerfilProveedor(item.PROVEEDOR);
  }

  addDetalle(): void {
    if (this.detalleForm.invalid) {
      this.errorDetalle.set('Complete los campos requeridos del detalle.');
      return;
    }
    const v = this.detalleForm.getRawValue();
    const hv = this.headerForm.getRawValue();
    const esDTE = v.esDTE;
    const monto = Number(v.MONTO ?? 0);
    const porc = Number(v.PORC_RETENCION ?? 1);
    
    if (monto <= 0) {
      this.errorDetalle.set('NO PUEDE INGRESAR EL MONTO MENOR O IGUAL A CERO');
      return;
    }

    if (esDTE && !v.COD_GENERACION) {
      this.errorDetalle.set('POR FAVOR DIGITE COMPROBANTE (CÓDIGO DE GENERACIÓN)');
      return;
    }
    
    if (!esDTE && !v.NUMERO) {
      this.errorDetalle.set('POR FAVOR DIGITE EL NÚMERO DE FACTURA');
      return;
    }

    const retencion = Math.round(monto * (porc / 100) * 100) / 100;
    const codGen = esDTE ? (v.COD_GENERACION ?? '') : '';
    const tipoDoc = v.TIPO_DOC ?? '03';
    const fechaDoc = v.FECHA_DOC ?? hv.FECHA ?? '';

    // Si es DTE, validamos en MH antes de guardar
    if (esDTE) {
      const idEmpresa = this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0;
      const urlApi = this.authService.currentUser()?.selectedEmpresa?.urlApi ?? '';
      const nitProveedor = this.proveedorPerfil()?.NIT ?? '';
      const ambiente = this.getAmbiente();

      this.addingDetalle.set(true);
      this.errorDetalle.set('');
      
      this.service.validarDteMH(urlApi, idEmpresa, fechaDoc, codGen, nitProveedor, tipoDoc, ambiente)
        .subscribe({
          next: (res) => {
            if (res && res.length > 0) {
              const dte = res[0];
              if (dte.response !== 'PROCESADO') {
                this.errorDetalle.set(dte.response ?? 'Error desconocido al validar el comprobante en MH');
                this.addingDetalle.set(false);
                return;
              }
              // Guardar detalle usando el selloRecibido
              this.guardarDetalleBase(codGen, codGen, dte.selloRecibido ?? '', monto, retencion, fechaDoc, tipoDoc, v.DESCRIPCION ?? '');
            } else {
              this.errorDetalle.set('Error al verificar existencia del comprobante en MH');
              this.addingDetalle.set(false);
            }
          },
          error: (err) => {
            this.errorDetalle.set('Error de conexión al validar el comprobante en MH');
            this.addingDetalle.set(false);
          }
        });
    } else {
      // Si no es DTE, el documento relacionado es Serie + Número y el sello es Número
      const docRelacionado = (v.SERIE ?? '') + (v.NUMERO ?? '');
      const sello = v.NUMERO ?? '';
      this.guardarDetalleBase('', docRelacionado, sello, monto, retencion, fechaDoc, tipoDoc, v.DESCRIPCION ?? '');
    }
  }

  private guardarDetalleBase(codGen: string, docRelacionado: string, sello: string, monto: number, retencion: number, fechaDoc: string, tipoDoc: string, descripcion: string): void {
    const hv = this.headerForm.getRawValue();
    const dto: CRDetalleSaveDto = {
      Correl: this.correl(),
      COMPROBANTE: hv.COMPROBANTE ?? '',
      PROVEEDOR: hv.PROVEEDOR ?? '',
      PORC_RETENCION: this.detalleForm.getRawValue().PORC_RETENCION ?? 1,
      DESCRIPCION: descripcion,
      MONTO: monto,
      RETENCION: retencion,
      FECHA: fechaDoc,
      TipoDocumentoRelacionado: tipoDoc,
      SelloRecepcion: sello,
      DocumentoRelacionado: docRelacionado,
    };

    this.addingDetalle.set(true);
    this.errorDetalle.set('');
    this.service.addDetalle(dto)
      .pipe(finalize(() => this.addingDetalle.set(false)))
      .subscribe({
        next: () => {
          this.detalleForm.reset({ TIPO_DOC: '03', esDTE: true, PORC_RETENCION: 1 });
          this.loadDetalle();
        },
        error: (err) => this.errorDetalle.set(`Error al agregar: ${err?.error ?? 'Error inesperado'}`),
      });
  }

  deleteDetalle(row: CRDetalleDto): void {
    const hv = this.headerForm.getRawValue();
    const dto: CRDetalleDeleteDto = {
      Correl: this.correl(),
      PROVEEDOR: hv.PROVEEDOR ?? '',
      CODIGO_RETENCION: row.CODIGO_RETENCION ?? 'RE01',
      LINEA: row.LINEA ?? 0,
    };
    this.service.deleteDetalle(dto).subscribe({
      next: () => this.loadDetalle(),
      error: (err) => this.errorDetalle.set(`Error al eliminar: ${err?.error ?? 'Error inesperado'}`),
    });
  }

  emitirDTE(): void {
    const idEmpresa = this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0;
    const username = this.authService.currentUser()?.username ?? '';
    const ambiente = this.getAmbiente();
    const seqDto: VerificarSecuenciasDto = {
      IdEmpresa: idEmpresa,
      AmbienteEmision: ambiente,
      TipoFactura: 'CR',
      TipoDoc: '07',
    };

    this.emitting.set(true);
    this.errorMessage.set('');
    this.facturacionService.verificarSecuencias(seqDto)
      .subscribe({
        next: () => {
          const payload: ParametrosDteDto = {
            idFactura: this.correl(),
            idEmpresa,
            ambiente,
            codEstablecimiento: 'M001',
            codPuntoVenta: 'P001',
            user: username,
          };
          this.facturacionService.emitirDte(this.getMailDteUrl(), payload, 'CR')
            .pipe(finalize(() => this.emitting.set(false)))
            .subscribe({
              next: (res) => {
                if (res.SelloRecepcion) {
                  this.service.getCRById(this.correl()).subscribe({
                    next: (enc) => { if (enc) this.encabezado.set(enc); },
                  });
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
    this.anulando.set(true);
    this.errorMessage.set('');
    this.service.anularCR(this.correl())
      .pipe(finalize(() => this.anulando.set(false)))
      .subscribe({
        next: () => {
          this.anulacionDialogVisible.set(false);
          this.service.getCRById(this.correl()).subscribe({
            next: (enc) => { if (enc) this.encabezado.set(enc); },
          });
        },
        error: (err) => this.errorMessage.set(`Error al anular: ${err?.error ?? 'Error inesperado'}`),
      });
  }

  solicitarEliminarCR(item: CRListadoDto): void {
    this.eliminarConfirmDialog.abrir(() => this.deleteCR(item));
  }

  deleteCR(item: CRListadoDto): void {
    this.service.deleteCR(item.ID).subscribe({
      next: () => this.loadListado(),
      error: (err) => this.errorMessage.set(`Error al eliminar: ${err?.error ?? 'Error inesperado'}`),
    });
  }

  onReenviarCorreo(item: CRListadoDto): void {
    const idEmpresa = this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0;
    const idFactura = item.ID;
    this.service.getPerfilProveedor(item.PROVEEDOR).subscribe({
      next: (perfil) => {
        const correoDefault = String(perfil?.CORREO_ELECTRONICO ?? '').trim();
        this.reenviarCorreoDialog.abrir(idEmpresa, idFactura, 'CR', correoDefault);
      },
      error: () => this.reenviarCorreoDialog.abrir(idEmpresa, idFactura, 'CR', ''),
    });
  }

  verComprobante(): void {
    const enc = this.encabezado();
    if (!enc) return;
    const idEmpresa = this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0;
    const url = this.facturacionService.getPreviewDteUrl(idEmpresa, enc.ID ?? enc.CORREL, 'CR', !!enc.SelloRecepcion);
    window.open(url, '_blank');
  }

  verComprobanteNC(): void {
    const enc = this.encabezado();
    if (!enc) return;
    const idEmpresa = this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0;
    const url = this.facturacionService.getPreviewDteUrl(idEmpresa, enc.ID ?? enc.CORREL, 'NCCR', !!enc.SelloRecepcion);
    window.open(url, '_blank');
  }

  emitirNC(): void {
    const idEmpresa = this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0;
    const username = this.authService.currentUser()?.username ?? '';
    const ambiente = this.getAmbiente();
    const seqDto: VerificarSecuenciasDto = {
      IdEmpresa: idEmpresa,
      AmbienteEmision: ambiente,
      TipoFactura: 'NC',
      TipoDoc: '05',
    };

    this.emitting.set(true);
    this.errorMessage.set('');
    this.facturacionService.verificarSecuencias(seqDto)
      .subscribe({
        next: () => {
          const payload: ParametrosDteDto = {
            idFactura: this.correl(),
            idEmpresa,
            ambiente,
            codEstablecimiento: 'M001',
            codPuntoVenta: 'P001',
            user: username,
          };
          this.facturacionService.emitirDte(this.getMailDteUrl(), payload, 'NC')
            .pipe(finalize(() => this.emitting.set(false)))
            .subscribe({
              next: (res) => {
                if (res.SelloRecepcion) {
                  this.messageService.add({ severity: 'success', summary: 'NC Emitida', detail: 'Nota de crédito emitida con éxito.' });
                  this.verComprobanteNC();
                } else {
                  this.errorMessage.set(res.MensajeGeneral ?? 'Error al emitir NC.');
                }
              },
              error: (err) => this.errorMessage.set(`Error DTE (NC): ${err?.error ?? 'Error inesperado'}`),
            });
        },
        error: (err) => {
          this.emitting.set(false);
          this.errorMessage.set(`Secuencias NC: ${err?.error?.message ?? err?.message ?? 'Error'}`);
        },
      });
  }

  private numberToSimpleWords(value: number): string {
    const rounded = Number(value.toFixed(2));
    const integerPart = Math.floor(rounded);
    const decimalPart = Math.round((rounded - integerPart) * 100);
    return `${integerPart} CON ${String(decimalPart).padStart(2, '0')}/100 DÓLARES`;
  }

  estadoSeverity(estado: string): 'success' | 'warn' | 'danger' | 'secondary' | 'info' {
    switch (estado?.toUpperCase()) {
      case 'EMITIDO': return 'success';
      case 'ELABORACION': return 'info';
      case 'ANULADO': return 'danger';
      default: return 'secondary';
    }
  }

  // Badge de estado (estándar visual ccf: ESTADO + Sello → clave/etiqueta).
  estadoBadgeKey(estado: unknown, sello?: unknown): 'ELABORACION' | 'PENDIENTE_EMITIR' | 'EMITIDO' | 'ANULADO' | 'OTRO' {
    const n = this.normalizeEstadoValue(estado);
    if (n === 'APLICADO') return String(sello ?? '').trim() ? 'EMITIDO' : 'PENDIENTE_EMITIR';
    if (n === 'ANULADO') return 'ANULADO';
    if (n === 'ELABORACION') return 'ELABORACION';
    return 'OTRO';
  }
  estadoBadgeLabel(estado: unknown, sello?: unknown): string {
    switch (this.estadoBadgeKey(estado, sello)) {
      case 'ELABORACION': return 'En elaboración';
      case 'PENDIENTE_EMITIR': return 'Pendiente de emitir';
      case 'EMITIDO': return 'Emitido';
      case 'ANULADO': return 'Anulado';
      default: return String(estado ?? '').trim().toUpperCase() || '—';
    }
  }
  private normalizeEstadoValue(value: unknown): 'ELABORACION' | 'APLICADO' | 'ANULADO' | 'OTRO' {
    const e = String(value ?? '').trim().toUpperCase();
    if (!e || e === 'E' || e === 'BORRADOR' || e === 'ELABORACION') return 'ELABORACION';
    if (e === 'A' || e === 'APLICADA' || e === 'APLICADO' || e === 'EMITIDO' || e === 'EMITIDA') return 'APLICADO';
    if (e === 'N' || e === 'ANULADA' || e === 'ANULADO') return 'ANULADO';
    return 'OTRO';
  }

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-SV', { style: 'currency', currency: 'USD' }).format(v ?? 0);
  }
}
