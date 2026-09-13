import { Injectable, inject } from '@angular/core';
import { Observable, from, of, throwError } from 'rxjs';
import { concatMap, map, switchMap, toArray, catchError } from 'rxjs/operators';
import { AuthService } from '../../../core/services/auth';
import { FacturacionService } from '../services/facturacion';
import {
  DeleteFacturaDto,
  FacturaDetalleDto,
  FacturaEncabezadoDto,
  FacturaTotalesDto,
  FormaPagoDto,
  ParametrosDteDto,
  PerfilClienteDto,
  SucursalPuntoVendedorDto,
  UpdateDetalleFacturaDto,
  UpdateFacturaDto,
  UpdateFacturacionAplicacionDto,
  VerificarSecuenciasDto
} from '../../../core/models/facturacion.models';

/** Una forma de pago del cobro: `monto` = importe aplicado a la venta (para efectivo, NO el recibido). */
export interface PosPago {
  codigo: string;
  descripcion: string;
  monto: number;
}

export interface PosLineaVenta {
  articulo: string;
  descripcion: string;
  unidad: string;
  precio: number;
  cantidad: number;
  linea?: number; // LINEA del detalle en el servidor (para actualizar/eliminar)
}

export interface VentaKeys {
  codGeneracion: string;
  prefijo: string;
  factura: string;
  sucursal: string;
  puntoVenta: string;
  idFactura: number;
}

export interface PosVentaResultado {
  keys: VentaKeys;
  cliente: PerfilClienteDto | null;
  ambiente: string;             // '00' | '01'
  detalle: FacturaDetalleDto[];
  numeroControl: string;
  selloRecepcion: string;
  emitido: boolean;
}

/**
 * Orquestación del POS híbrido — persist-as-you-go, AISLADA de fac-pos/fac/ccf (enfoque A).
 * Mantiene una FACTURA borrador (elaboración) que se va armando en el servidor, de modo que el
 * cambio de cliente dispare el reprice de mayoreo/preferencial (ya arreglado en UpdateFactura) y
 * se pueda mostrar en pantalla. No toca el core de facturación.
 *
 * SEGURIDAD: eliminarBorrador NUNCA borra un documento con Sello de Recepción (emitido).
 */
@Injectable({ providedIn: 'root' })
export class PosVentaService {
  private auth = inject(AuthService);
  private fact = inject(FacturacionService);

  private bodega = 'BOD01'; // Configurable por sucursal/punto de venta o módulo externo (Cafetería EuroSoccer)
  setBodega(b: string): void {
    if (b) this.bodega = b.trim();
  }
  getBodega(): string {
    return this.bodega;
  }
  private readonly tipoFactura = 'FAC';

  private get usuario(): string { return String(this.auth.currentUser()?.username ?? '').trim(); }
  private get idEmpresa(): number { return this.auth.currentUser()?.selectedEmpresa?.idEmpresa ?? 0; }
  get ambiente(): string {
    return Number(this.auth.currentUser()?.selectedEmpresa?.ambienteEmision) === 0 ? '00' : '01';
  }
  /** Interruptor único por empresa (Configuracion.ConfigSistemaEmpresa, idParametro=6). Si está
   * apagado, la venta se registra sin contactar Hacienda y el ticket sale sin bloque fiscal. */
  get emiteDte(): boolean {
    return !!this.auth.currentUser()?.selectedEmpresa?.emiteDte;
  }

  // ── Borrador ────────────────────────────────────────────────────────────────
  crearBorrador(cliente: PerfilClienteDto | null): Observable<VentaKeys> {
    const codGeneracion = crypto.randomUUID().toUpperCase();
    const prefijo = codGeneracion.substring(0, 18);
    const factura = codGeneracion.substring(18, 36);

    return this.fact.getSucursalPuntoVendedor(this.usuario).pipe(
      switchMap((rows) => {
        const sp = (rows ?? [])[0] ?? null;
        const sucursal = sp?.Sucursal || '';
        const puntoVenta = sp?.PUNTO_VENTA || '';
        const header = this.buildHeader(codGeneracion, sucursal, puntoVenta, cliente);
        return this.fact.updateFactura(header).pipe(
          map((resp) => ({
            codGeneracion, prefijo, factura, sucursal, puntoVenta,
            idFactura: this.extractIdFactura(resp)
          }))
        );
      })
    );
  }

  guardarEncabezado(keys: VentaKeys, cliente: PerfilClienteDto | null, descuentoAdicional: number = 0): Observable<void> {
    const header = this.buildHeader(keys.codGeneracion, keys.sucursal, keys.puntoVenta, cliente, 'C', descuentoAdicional);
    return this.fact.updateFactura(header).pipe(map(() => void 0));
  }

  /**
   * Marca el documento como "recibo" del POS híbrido (Facturacion.FACTURA.EsRecibo) justo antes de
   * cobrar, cuando PosHibridoConfig está activo para la empresa. Solo afecta a quien lo manda; el
   * resto de facturas (fac, fac-pos, ccf, fex, nc y las ventas con esRecibo=false) no lo tocan.
   */
  marcarModoDocumento(keys: VentaKeys, cliente: PerfilClienteDto | null, esRecibo: boolean): Observable<void> {
    const header = this.buildHeader(keys.codGeneracion, keys.sucursal, keys.puntoVenta, cliente, 'C', 0, esRecibo);
    return this.fact.updateFactura(header).pipe(map(() => void 0));
  }

  // ── Líneas ──────────────────────────────────────────────────────────────────
  agregarLinea(keys: VentaKeys, l: PosLineaVenta): Observable<void> {
    return this.fact.updateDetalleFactura(this.buildDetalle(keys, l, 'A', 0)).pipe(map(() => void 0));
  }

  actualizarCantidad(keys: VentaKeys, l: PosLineaVenta): Observable<void> {
    return this.fact.updateDetalleFactura(this.buildDetalle(keys, l, 'A', l.linea ?? 0)).pipe(map(() => void 0));
  }

  eliminarLinea(keys: VentaKeys, l: PosLineaVenta): Observable<void> {
    return this.fact.updateDetalleFactura(this.buildDetalle(keys, l, 'B', l.linea ?? 0)).pipe(map(() => void 0));
  }

  cargarDetalle(keys: VentaKeys): Observable<FacturaDetalleDto[]> {
    return this.fact
      .getFacturaDetalle(keys.prefijo, keys.factura, keys.sucursal, keys.puntoVenta, this.tipoFactura)
      .pipe(map((d) => d ?? []));
  }

  cargarTotales(idFactura: number): Observable<FacturaTotalesDto | null> {
    if (!idFactura) return of(null);
    return this.fact.getFacturaTotales(idFactura).pipe(catchError(() => of(null)));
  }

  /**
   * Elimina el BORRADOR. GUARDA DE SEGURIDAD: primero lee el encabezado; si tiene Sello de
   * Recepción (documento emitido) NO borra y lanza error. Cumple "no eliminar documentos emitidos".
   */
  eliminarBorrador(keys: VentaKeys): Observable<void> {
    return this.fact.getFacturaEncabezado(keys.prefijo, keys.factura, keys.sucursal, keys.puntoVenta, this.idEmpresa).pipe(
      switchMap((enc) => {
        const sello = String((enc as { SelloRecepcion?: string } | null)?.SelloRecepcion ?? '').trim();
        if (sello) {
          return throwError(() => new Error('No se puede eliminar: el documento ya fue emitido (tiene Sello de Recepción).'));
        }
        const payload: DeleteFacturaDto = {
          Prefijo: keys.prefijo, Factura: keys.factura, Sucursal: keys.sucursal,
          PuntoVenta: keys.puntoVenta, TipoFactura: this.tipoFactura, Fecha: this.fechaHoy()
        };
        return this.fact.deleteFactura(payload).pipe(map(() => void 0));
      })
    );
  }

  /** Catálogo de formas de pago (Efectivo=código '01', etc.). */
  getFormasPago(): Observable<FormaPagoDto[]> { return this.fact.getFormasPago(); }

  /** Existencia VIGENTE (en línea, sin caché) del artículo en la bodega del POS. */
  getExistencia(articulo: string): Observable<number> {
    return this.fact.getInfoVentaArticulo(articulo, this.bodega).pipe(map((info) => Number(info?.existencia) || 0));
  }

  // ── Cobro & Emisión DTE ─────────────────────────────────────────────────────
  /**
   * Cobro: (si PosHibridoConfig está activo, marca EsRecibo según `modo`) → registrar formas de
   * pago (deja el documento pagado aunque siga En Elaboración) → aplicar → si corresponde emitir
   * DTE a Hacienda (con ambiente '00' o '01') → recargar.
   *
   * `modo='RECIBO'` (rubros configurados como recibo, sin queso en el carrito) NUNCA emite DTE, sin
   * importar el interruptor EmiteDTE de la empresa: queda "Aplicada, pendiente de emitir" hasta que
   * el admin la incluya en una factura consolidada (Cierre de Recibos). `modo='FACTURA_DIRECTA'`
   * (default cuando PosHibridoConfig no está activo) es el comportamiento de siempre.
   */
  finalizar(keys: VentaKeys, cliente: PerfilClienteDto | null, pagos: PosPago[], modo: 'FACTURA_DIRECTA' | 'RECIBO' = 'FACTURA_DIRECTA'): Observable<PosVentaResultado> {
    const ambiente = this.ambiente;
    const esRecibo = modo === 'RECIBO';
    const marcar$ = esRecibo ? this.marcarModoDocumento(keys, cliente, true) : of(void 0);
    return marcar$.pipe(
      switchMap(() => this.registrarPagos(keys, pagos)),
      switchMap(() => this.fact.updateFacturacionAplicacion(this.buildAplicar(keys))),
      switchMap(() => this.cargarDetalle(keys)),
      switchMap((detalle) => {
        const base: PosVentaResultado = {
          keys, cliente, ambiente, detalle, numeroControl: '', selloRecepcion: '', emitido: false
        };
        if (esRecibo || !this.emiteDte) {
          return of(base);
        }
        return this.emitirDte(keys).pipe(
          // La respuesta de la emisión no siempre trae NoControl (sí SelloRecepcion); se relee el
          // encabezado recién persistido para tomar el valor real, igual que hace fac.ts al reconciliar.
          switchMap((dte) =>
            this.fact.getFacturaEncabezado(keys.prefijo, keys.factura, keys.sucursal, keys.puntoVenta, this.idEmpresa).pipe(
              map((enc: FacturaEncabezadoDto) => ({
                ...base,
                numeroControl: String(enc?.NoControl ?? dte.numeroControl ?? '').trim(),
                selloRecepcion: String(enc?.SelloRecepcion ?? dte.selloRecepcion ?? '').trim(),
                emitido: !!dte.selloRecepcion
              })),
              catchError(() => of({ ...base, numeroControl: dte.numeroControl, selloRecepcion: dte.selloRecepcion, emitido: !!dte.selloRecepcion }))
            )
          ),
          catchError((err) => {
            console.error('Error en transmisión DTE:', err);
            return of(base);
          })
        );
      })
    );
  }

  /**
   * Registra las formas de pago en la factura (mismo mecanismo que fac-pos: `updateFacturaFormaPago`).
   * Reconciliación idempotente: da de baja las formas ya registradas y luego inserta las nuevas, de
   * modo que reintentar el cobro no duplique pagos. Requiere IdFactura (del borrador o del encabezado).
   */
  registrarPagos(keys: VentaKeys, pagos: PosPago[]): Observable<void> {
    return this.idFacturaConfiable$(keys).pipe(
      switchMap((idFactura) => {
        if (idFactura <= 0) return throwError(() => new Error('No se pudo obtener el IdFactura para registrar el pago.'));
        return this.fact.getFacturaFormaPago(idFactura).pipe(
          switchMap((existentes) => {
            const bajas = (existentes ?? []).map((e) => () =>
              this.fact.updateFacturaFormaPago({ IdFactura: idFactura, Codigo: String(e.Codigo ?? '').trim(), Monto: Number(e.Monto) || 0, TipoMtto: 'B' }));
            const altas = (pagos ?? []).filter((p) => (Number(p.monto) || 0) > 0).map((p) => () =>
              this.fact.updateFacturaFormaPago({ IdFactura: idFactura, Codigo: String(p.codigo ?? '').trim(), Monto: this.round2(p.monto), TipoMtto: 'A' }));
            const ops = [...bajas, ...altas];
            return from(ops).pipe(concatMap((op) => op()), toArray(), map(() => void 0));
          })
        );
      })
    );
  }

  private round2(v: number): number { return Math.round(((Number(v) || 0) + Number.EPSILON) * 100) / 100; }

  /** IdFactura del borrador; si no vino en la creación, lo resuelve desde el encabezado. */
  private idFacturaConfiable$(keys: VentaKeys): Observable<number> {
    if (keys.idFactura > 0) return of(keys.idFactura);
    return this.fact.getFacturaEncabezado(keys.prefijo, keys.factura, keys.sucursal, keys.puntoVenta, this.idEmpresa).pipe(
      map((enc) => Number((enc as { IdFactura?: number } | null)?.IdFactura ?? 0) || 0)
    );
  }

  // ── Emisión DTE (utiliza ambiente real '00' o '01') ────────────────────────
  private emitirDte(keys: VentaKeys): Observable<{ numeroControl: string; selloRecepcion: string }> {
    const apiBaseUrl = this.auth.getEmissionApiBaseUrl();
    if (!apiBaseUrl) return throwError(() => new Error('No se encontró UrlAPI de emisión en la sesión.'));

    const ambiente = this.ambiente; // Preserva '00' para pruebas o '01' para producción

    // keys.idFactura puede venir en 0 si crearBorrador no lo extrajo del alta; sin el IdFactura
    // correcto el servicio de emisión no puede persistir Sello/NoControl en el documento real.
    return this.idFacturaConfiable$(keys).pipe(
      switchMap((idFactura) => {
        if (idFactura <= 0) {
          return throwError(() => new Error('No se pudo resolver el IdFactura del documento para emitir el DTE.'));
        }
        return this.fact.getSucursalPuntoVendedor(this.usuario).pipe(
          switchMap((rows) => {
            const sp = (rows ?? []).find((r) => r.Sucursal === keys.sucursal && r.PUNTO_VENTA === keys.puntoVenta) ?? (rows ?? [])[0] ?? null;
            // Sin códigos MH resueltos NO se emite: emitir con valores ficticios generaría un DTE inválido.
            const codEstablecimiento = String(sp?.CodigoMHSC ?? '').trim();
            const codPuntoVenta = String(sp?.codigoMHPV ?? '').trim();
            if (!codEstablecimiento || !codPuntoVenta) {
              return throwError(() => new Error('No se pudieron resolver los códigos de establecimiento/punto de venta del Ministerio de Hacienda para esta sucursal. Verifique la configuración.'));
            }
            const verifica: VerificarSecuenciasDto = { IdEmpresa: this.idEmpresa, AmbienteEmision: ambiente, TipoFactura: this.tipoFactura, TipoDoc: '01' };
            const payload: ParametrosDteDto = {
              idFactura, idEmpresa: this.idEmpresa, ambiente: ambiente,
              codEstablecimiento,
              codPuntoVenta,
              user: this.usuario
            };
            return this.fact.serviceAvailable(apiBaseUrl).pipe(
              switchMap((status) => {
                if (String(status ?? '').trim().toLowerCase() !== 'online') return throwError(() => new Error('Servicio de emisión no disponible.'));
                return this.fact.verificarSecuencias(verifica);
              }),
              switchMap(() => this.fact.emitirDte(apiBaseUrl, payload, this.tipoFactura)),
              map((resp) => {
                const sello = String(resp?.SelloRecepcion ?? '').trim();
                if (!sello) throw new Error(String(resp?.MensajeGeneral ?? 'Emisión sin sello de recepción.'));
                return { numeroControl: String(resp?.NoControl ?? '').trim(), selloRecepcion: sello };
              })
            );
          })
        );
      })
    );
  }

  // ── Builders de payload ─────────────────────────────────────────────────────
  private buildHeader(codGeneracion: string, sucursal: string, puntoVenta: string, cliente: PerfilClienteDto | null, tipoMtto: 'A' | 'C' = 'A', descuentoAdicional: number = 0, esRecibo: boolean = false): UpdateFacturaDto {
    const anonimo = !cliente;
    return {
      CodGeneracion: codGeneracion,
      Sucursal: sucursal, PuntoVenta: puntoVenta,
      TipoVenta: 'G',
      Cliente: anonimo ? '' : (cliente!.CLIENTE ?? '').trim(),
      FacturarA: anonimo ? 'Sr(a)' : ((cliente!.NOMBRE ?? '').trim() || 'Sr(a)'),
      Fecha: this.fechaHoy(),
      CondicionPago: (cliente?.CONDICION_PAGO ?? '').trim() || 'CONTADO',
      Vendedor: 'OFICINA', Observaciones: '',
      Usuario: this.usuario, TipoMtto: tipoMtto, Contabilizar: 0,
      SubTotal: 0, IVA: 0, Impuesto2: 0, Impuesto3: 0, Retencion: 0,
      NIT: (cliente?.NIT ?? '').trim(), RegistroComercio: (cliente?.REGISTRO_COMERCIO ?? '').trim(),
      NumeroResolucion: '', ExistenciaFecDoc: 0, NumeroControl: '', SelloRecepcion: '',
      JSON: '', IdCondicionTraslado: '', NombreEntrega: '', IdentificacionEntrega: '',
      NombreRecibe: '', IdentificacionRecibe: '', TipoDestinoRemision: '', Proveedor: '',
      IdModoTransporte: 0, NombreConductor: '', NumeroConductor: '', PlacaTransporte: '',
      IdRecintoFiscal: 0, IdIncoterm: 0, IdRegimenExportacion: 0,
      PrecioConIVA: 1,
      Flete: 0, Seguro: 0, DescuentoAdicional: descuentoAdicional, DTE: 0,
      CorreoCliente: (cliente?.CORREO_ELECTRONICO ?? '').trim(),
      TipoFactura: this.tipoFactura,
      TipoRegimen: '',
      EsRecibo: esRecibo
    };
  }

  private buildDetalle(keys: VentaKeys, l: PosLineaVenta, tipoMtto: 'A' | 'B', linea: number): UpdateDetalleFacturaDto {
    const total = Math.round((l.precio * l.cantidad + Number.EPSILON) * 100) / 100;
    return {
      CodGeneracion: keys.codGeneracion,
      Sucursal: keys.sucursal, PuntoVenta: keys.puntoVenta, TipoFactura: this.tipoFactura,
      Cantidad: l.cantidad, Articulo: l.articulo, Descripcion: l.descripcion,
      PrecioUnitario: l.precio, CostoUnitario: 0, Calidad: '',
      Bodega: this.bodega,
      UnidadMedida: l.unidad,
      Usuario: this.usuario, TipoMtto: tipoMtto, Linea: linea,
      SubTotal: total, IVA: 0, Impuesto2: 0, Impuesto3: 0, Retencion: 0,
      TipoColor: 'NA', CantidadConversion: l.cantidad, UnidadMedidaConversion: l.unidad,
      IdColor: 0, IdAcabado: ''
    };
  }

  private buildAplicar(keys: VentaKeys): UpdateFacturacionAplicacionDto {
    return {
      CodGeneracion: keys.codGeneracion,
      Sucursal: keys.sucursal, PuntoVenta: keys.puntoVenta, TipoFactura: this.tipoFactura,
      Usuario: this.usuario, IdEmpresa: this.idEmpresa, TipoMtto: 'Aplicar'
    };
  }

  private extractIdFactura(resp: unknown): number {
    const raw = (resp ?? {}) as Record<string, unknown>;
    const v = raw['idFactura'] ?? raw['IdFactura'] ?? raw['IDFACTURA'];
    const n = typeof v === 'number' ? v : parseInt(String(v ?? '0'), 10);
    return Number.isFinite(n) ? n : 0;
  }

  private fechaHoy(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
