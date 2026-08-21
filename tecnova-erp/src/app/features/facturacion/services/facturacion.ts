import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, catchError, finalize, map, of, shareReplay, tap, throwError } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  AnulacionFacturaDto,
  ArticuloPorBodegaDto,
  InfoVentaArticuloDto,
  DatosDestinatarioDteDto,
  DteSelladoDto,
  FacSavePayload,
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
  RespuestaDteDto,
  SucursalPuntoVendedorDto,
  UpdateDetalleFacturaDto,
  UpdateFacturacionAplicacionDto,
  UpdateCambioTipoFacturaDto,
  UpdateFacturaDto,
  UpdateFacturaFormaPagoDto,
  VerificarSecuenciasDto,
  UpdateFacturaRetencionDto,
  CcfParaNcDto,
  UpdateDetalleFacturaDescuentoDto,
  UpdateFacturaDevolucionDto,
  RecintoFiscalCatalogo,
  RegimenExportacionCatalogo,
  TipoRegimenCatalogo
} from '../../../core/models/facturacion.models';

@Injectable({ providedIn: 'root' })
export class FacturacionService {
  private http = inject(HttpClient);
  private facturaApiUrl = `${environment.apiUrl}/Factura`;
  private readonly mailDteApiUrl = environment.production
    ? 'https://maildte.kulstoresv.com'
    : '/maildte-proxy';
  private readonly defaultCacheTtlMs = 5 * 60 * 1000;
  private readonly shortCacheTtlMs = 30 * 1000;
  private readonly cacheStore = new Map<string, { expiresAt: number; data: unknown }>();
  private readonly inFlightStore = new Map<string, Observable<unknown>>();

  private getCachedRequest<T>(cacheKey: string, requestFactory: () => Observable<T>, ttlMs: number = this.defaultCacheTtlMs): Observable<T> {
    const now = Date.now();
    const cached = this.cacheStore.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return of(cached.data as T);
    }

    const inFlight = this.inFlightStore.get(cacheKey);
    if (inFlight) {
      return inFlight as Observable<T>;
    }

    const request$ = requestFactory().pipe(
      tap((data) => {
        this.cacheStore.set(cacheKey, {
          expiresAt: now + Math.max(0, ttlMs),
          data
        });
      }),
      finalize(() => {
        this.inFlightStore.delete(cacheKey);
      }),
      shareReplay(1)
    );

    this.inFlightStore.set(cacheKey, request$ as Observable<unknown>);
    return request$;
  }

  private invalidateCacheByPrefix(prefix: string): void {
    for (const key of Array.from(this.cacheStore.keys())) {
      if (key.startsWith(prefix)) {
        this.cacheStore.delete(key);
      }
    }

    for (const key of Array.from(this.inFlightStore.keys())) {
      if (key.startsWith(prefix)) {
        this.inFlightStore.delete(key);
      }
    }
  }

  clearArticulosCache(bodega: string = 'BOD01'): void {
    const bodegaNormalized = String(bodega || 'BOD01').trim() || 'BOD01';
    this.invalidateCacheByPrefix(`catalogo:articulos:${bodegaNormalized}`);
  }

  clearClientesCache(): void {
    this.invalidateCacheByPrefix('catalogo:perfilClientes');
  }

  private invalidateFacturasGeneralCache(): void {
    this.invalidateCacheByPrefix('facturasGeneral:');
  }

  clearFacturasGeneralCache(): void {
    this.invalidateFacturasGeneralCache();
  }

  // Backend responses may come with inconsistent casing (e.g. noControl, NoControl, NOCONTROL).
  private pickValue(raw: Record<string, unknown>, ...keys: string[]): unknown {
    for (const key of keys) {
      const direct = raw[key];
      if (direct !== undefined && direct !== null) {
        return direct;
      }

      const normalized = Object.keys(raw).find((entryKey) => entryKey.toLowerCase() === key.toLowerCase());
      if (!normalized) {
        continue;
      }

      const normalizedValue = raw[normalized];
      if (normalizedValue !== undefined && normalizedValue !== null) {
        return normalizedValue;
      }
    }

    return undefined;
  }

  private toNumber(value: unknown, fallback: number = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private toString(value: unknown): string {
    return String(value ?? '').trim();
  }

  private mapFacturaGeneral(raw: Record<string, unknown>): FacturaGeneralDto {
    return {
      CLIENTE: this.toString(this.pickValue(raw, 'CLIENTE', 'cliente')),
      CodGeneracion: this.toString(this.pickValue(raw, 'CodGeneracion', 'codGeneracion')),
      CODIGOSUCURSAL: this.toString(this.pickValue(raw, 'CODIGOSUCURSAL', 'codigosucursal')),
      ESTADO: this.toString(this.pickValue(raw, 'ESTADO', 'estado')),
      FACTURAR_A: this.toString(this.pickValue(raw, 'FACTURAR_A', 'facturaR_A')),
      FACTURA_INTERNA: this.toString(this.pickValue(raw, 'FACTURA_INTERNA', 'facturA_INTERNA')),
      FECHA: this.toString(this.pickValue(raw, 'FECHA', 'fecha')),
      iddoc: this.toString(this.pickValue(raw, 'iddoc')),
      Modulo_CXC: this.toString(this.pickValue(raw, 'Modulo_CXC', 'modulo_CXC')),
      NoControl: this.toString(this.pickValue(raw, 'NoControl', 'noControl')),
      PARTIDA: this.toString(this.pickValue(raw, 'PARTIDA', 'partida')),
      PUNTO_VENTA: this.toString(this.pickValue(raw, 'PUNTO_VENTA', 'puntO_VENTA')),
      SelloRecepcion: this.toString(this.pickValue(raw, 'SelloRecepcion', 'selloRecepcion')),
      SUCURSAL: this.toString(this.pickValue(raw, 'SUCURSAL', 'sucursal')),
      Tipo_Factura: this.toString(this.pickValue(raw, 'Tipo_Factura', 'tipo_Factura')),
      TOTAL: this.toString(this.pickValue(raw, 'TOTAL', 'total')),
      Prefijo: this.toString(this.pickValue(raw, 'Prefijo', 'PREFIJO', 'prefijo')),
      Factura: this.toString(this.pickValue(raw, 'Factura', 'FACTURA', 'factura')),
      Observacion: this.toString(this.pickValue(raw, 'Observacion', 'Observaciones', 'observacion')),
      idDTE: this.toNumber(this.pickValue(raw, 'idDTE', 'IDDTE')),
      pago: this.toString(this.pickValue(raw, 'pago', 'Pago', 'PAGO'))
    };
  }

  private mapFacturaEncabezado(raw: Record<string, unknown>): FacturaEncabezadoDto {
    const precioConIvaRaw = this.pickValue(raw, 'PrecioConIVA', 'precioConIVA');

    return {
      IdFactura: this.toNumber(this.pickValue(raw, 'IdFactura', 'idFactura')),
      Sucursal: this.toString(this.pickValue(raw, 'Sucursal', 'SUCURSAL', 'sucursal')),
      PuntoVenta: this.toString(this.pickValue(raw, 'PuntoVenta', 'PUNTO_VENTA', 'puntO_VENTA', 'puntoVenta')),
      Estado: this.toString(this.pickValue(raw, 'Estado', 'estado')),
      Vendedor: this.toString(this.pickValue(raw, 'Vendedor', 'VENDEDOR', 'vendedor')),
      Fecha: this.toString(this.pickValue(raw, 'Fecha', 'FECHA', 'fecha')),
      Cliente: this.toString(this.pickValue(raw, 'Cliente', 'CLIENTE', 'cliente')),
      FacturarA: this.toString(this.pickValue(raw, 'FacturarA', 'FACTURAR_A', 'facturarA')),
      Nombre: this.toString(this.pickValue(raw, 'Nombre', 'NOMBRE', 'nombre')),
      NIT: this.toString(this.pickValue(raw, 'NIT', 'nit')),
      Identificacion: this.toString(this.pickValue(raw, 'Identificacion', 'IDENTIFICACION', 'identificacion')),
      RegistroComercio: this.toString(this.pickValue(raw, 'RegistroComercio', 'REGISTRO_COMERCIO', 'registroComercio')),
      NombreComercial: this.toString(this.pickValue(raw, 'NombreComercial', 'nombreComercial')),
      Giro: this.toString(this.pickValue(raw, 'Giro', 'giro')),
      CorreoElectronico: this.toString(this.pickValue(raw, 'CorreoElectronico', 'CORREO_ELECTRONICO', 'correoElectronico')),
      Pais: this.toString(this.pickValue(raw, 'Pais', 'pais')),
      Departamento: this.toString(this.pickValue(raw, 'Departamento', 'departamento')),
      Municipio: this.toString(this.pickValue(raw, 'Municipio', 'municipio')),
      Direccion: this.toString(this.pickValue(raw, 'Direccion', 'DIRECCION', 'direccion')),
      IdRecintoFiscal: this.toNumber(this.pickValue(raw, 'idRecintoFiscal', 'IdRecintoFiscal')),
      IdRegimenExportacion: this.toNumber(this.pickValue(raw, 'idRegimenExportacion', 'IdRegimenExportacion')),
      TipoRegimen: this.toString(this.pickValue(raw, 'TipoRegimen', 'tipoRegimen')),
      Flete: this.toNumber(this.pickValue(raw, 'Flete', 'flete', 'FLETE')),
      Seguro: this.toNumber(this.pickValue(raw, 'Seguro', 'seguro', 'SEGURO')),
      TipoVenta: this.toString(this.pickValue(raw, 'TipoVenta', 'TIPO_VENTA', 'tipoVenta')),
      TipoFactura: this.toString(this.pickValue(raw, 'TipoFactura', 'TIPO_FACTURA', 'tipoFactura')),
      CondicionPago: this.toString(this.pickValue(raw, 'CondicionPago', 'CONDICION_PAGO', 'condicionPago')),
      Prefijo: this.toString(this.pickValue(raw, 'Prefijo', 'PREFIJO', 'prefijo')),
      Factura: this.toString(this.pickValue(raw, 'Factura', 'FACTURA', 'factura')),
      Observaciones: this.toString(this.pickValue(raw, 'Observaciones', 'OBSERVACIONES', 'observaciones')),
      TotalImpuesto1: this.toNumber(this.pickValue(raw, 'TotalImpuesto1', 'TOTAL_IMPUESTO1', 'totalImpuesto1')),
      Sumas: this.toNumber(this.pickValue(raw, 'Sumas', 'SUMAS', 'sumas')),
      Retencion: this.toNumber(this.pickValue(raw, 'Retencion', 'RETENCION', 'retencion')),
      TotalFactura: this.toNumber(this.pickValue(raw, 'TotalFactura', 'TOTAL_FACTURA', 'totalFactura')),
      ValorLetras: this.toString(this.pickValue(raw, 'ValorLetras', 'valorLetras')),
      NoControl: this.toString(this.pickValue(raw, 'NoControl', 'noControl')),
      SelloRecepcion: this.toString(this.pickValue(raw, 'SelloRecepcion', 'selloRecepcion')),
      CodGeneracion: this.toString(this.pickValue(raw, 'CodGeneracion', 'codigoGeneracion', 'codGeneracion')),
      IdDTE: this.toNumber(this.pickValue(raw, 'IdDTE', 'idDTE')),
      PrecioConIVA: String(precioConIvaRaw).toLowerCase() === 'true' || precioConIvaRaw === true,
      Proveedor: this.toString(this.pickValue(raw, 'Proveedor', 'proveedor')),
      NombreProveedor: this.toString(this.pickValue(raw, 'NombreProveedor', 'nombreProveedor')),
      TotalOperacion: this.toNumber(this.pickValue(raw, 'TotalOperacion', 'totalOperacion')),
      DescuentoAdicional: this.toNumber(this.pickValue(raw, 'DescuentoAdicional', 'descuentoAdicional')),
      SubTotalVentas: this.toNumber(this.pickValue(raw, 'SubTotalVentas', 'subTotalVentas'))
    };
  }

  private mapSucursalPuntoVendedor(raw: Record<string, unknown>): SucursalPuntoVendedorDto {
    return {
      CODIGO: this.toString(this.pickValue(raw, 'CODIGO', 'codigo')),
      codigoMHPV: this.toString(this.pickValue(raw, 'codigoMHPV', 'codigomhpv', 'CodigoMHPV')),
      CodigoMHSC: this.toString(this.pickValue(raw, 'CodigoMHSC', 'codigoMHSC', 'codigomhsc')),
      NOMBRE: this.toString(this.pickValue(raw, 'NOMBRE', 'nombre')),
      NombrePV: this.toString(this.pickValue(raw, 'NombrePV', 'nombrePV', 'nombrepv')),
      NombreSC: this.toString(this.pickValue(raw, 'NombreSC', 'nombreSC', 'nombresc')),
      PUNTO_VENTA: this.toString(this.pickValue(raw, 'PUNTO_VENTA', 'puntO_VENTA', 'puntoVenta', 'punto_venta')),
      Sucursal: this.toString(this.pickValue(raw, 'Sucursal', 'sucursal', 'SUCURSAL')),
      UsuarioAsignado: this.toString(this.pickValue(raw, 'UsuarioAsignado', 'usuarioAsignado', 'USUARIOASIGNADO')),
      ID_EMPRESA: this.toString(this.pickValue(raw, 'ID_EMPRESA', 'iD_EMPRESA', 'idEmpresa', 'id_empresa'))
    };
  }

  private mapFacturaDetalle(raw: Record<string, unknown>): FacturaDetalleDto {
    return {
      LINEA: this.toNumber(this.pickValue(raw, 'LINEA', 'linea')),
      ARTICULO: this.toString(this.pickValue(raw, 'ARTICULO', 'articulo')),
      DESCRIPCION: this.toString(this.pickValue(raw, 'DESCRIPCION', 'descripcion')),
      CALIDAD: this.toString(this.pickValue(raw, 'CALIDAD', 'calidad')),
      CANTIDAD: this.toNumber(this.pickValue(raw, 'CANTIDAD', 'cantidad')),
      PRECIO_UNITARIO: this.toNumber(this.pickValue(raw, 'PRECIO_UNITARIO', 'preciO_UNITARIO', 'precioUnitario')),
      COSTO_UNITARIO: this.toNumber(this.pickValue(raw, 'COSTO_UNITARIO', 'costO_UNITARIO', 'costoUnitario')),
      TOTAL: this.toNumber(this.pickValue(raw, 'TOTAL', 'total')),
      UNIDAD_MEDIDA: this.toString(this.pickValue(raw, 'UNIDAD_MEDIDA', 'unidaD_MEDIDA', 'unidadMedida')),
      BODEGA: this.toString(this.pickValue(raw, 'BODEGA', 'bodega')),
      CENTROCOSTOINVENTARIO: this.toString(this.pickValue(raw, 'CENTROCOSTOINVENTARIO', 'centrocostoinventario')),
      CUENTACONTABLEINVENTARIO: this.toString(this.pickValue(raw, 'CUENTACONTABLEINVENTARIO', 'cuentacontableinventario')),
      TIPO_ARTICULO: this.toString(this.pickValue(raw, 'TIPO_ARTICULO', 'tipO_ARTICULO', 'tipoArticulo')),
      CANTIDAD_KARDEX: this.toNumber(this.pickValue(raw, 'CANTIDAD_KARDEX', 'cantidaD_KARDEX', 'cantidadKardex')),
      UNIDAD_MEDIDA_KARDEX: this.toString(this.pickValue(raw, 'UNIDAD_MEDIDA_KARDEX', 'unidaD_MEDIDA_KARDEX', 'unidadMedidaKardex')),
      ID_COLOR: this.toNumber(this.pickValue(raw, 'ID_COLOR', 'iD_COLOR', 'idColor')),
      COLOR: this.toString(this.pickValue(raw, 'COLOR', 'color')),
      IdAcabado: this.toString(this.pickValue(raw, 'IdAcabado', 'idAcabado')),
      Acabado: this.toString(this.pickValue(raw, 'Acabado', 'acabado')),
      TIPO_COLOR: this.toString(this.pickValue(raw, 'TIPO_COLOR', 'tipO_COLOR', 'tipoColor')),
      TipoDescuento: this.toString(this.pickValue(raw, 'TipoDescuento', 'tipoDescuento')),
      Descuento: this.toNumber(this.pickValue(raw, 'Descuento', 'descuento')),
      TotalVenta: this.toNumber(this.pickValue(raw, 'TotalVenta', 'totalVenta'))
    };
  }

  private mapPerfilCliente(raw: Record<string, unknown>): PerfilClienteDto {
    return {
      CLIENTE: this.toString(this.pickValue(raw, 'CLIENTE', 'cliente')),
      NOMBRE: this.toString(this.pickValue(raw, 'NOMBRE', 'nombre')),
      NIT: this.toString(this.pickValue(raw, 'NIT', 'nit')),
      IDENTIFICACION: this.toString(this.pickValue(raw, 'IDENTIFICACION', 'identificacion')),
      REGISTRO_COMERCIO: this.toString(this.pickValue(raw, 'REGISTRO_COMERCIO', 'registroComercio')),
      CONDICION_PAGO: this.toString(this.pickValue(raw, 'CONDICION_PAGO', 'condicion_Pago', 'condicionPago')),
      VENDEDOR: this.toString(this.pickValue(raw, 'VENDEDOR', 'vendedor')),
      Giro: this.toString(this.pickValue(raw, 'Giro', 'giro')),
      CORREO_ELECTRONICO: this.toString(this.pickValue(raw, 'CORREO_ELECTRONICO', 'correoElectronico')),
      Pais: this.toString(this.pickValue(raw, 'Pais', 'pais')),
      Departamento: this.toString(this.pickValue(raw, 'Departamento', 'departamento')),
      Municipio: this.toString(this.pickValue(raw, 'Municipio', 'municipio')),
      DIRECCION: this.toString(this.pickValue(raw, 'DIRECCION', 'direccion'))
    };
  }

  private mapArticuloPorBodega(raw: Record<string, unknown>): ArticuloPorBodegaDto {
    return {
      ARTICULO: this.toString(this.pickValue(raw, 'ARTICULO', 'articulo')),
      DESCRIPCION: this.toString(this.pickValue(raw, 'DESCRIPCION', 'descripcion')),
      TIPO_ARTICULO: this.toString(this.pickValue(raw, 'TIPO_ARTICULO', 'tipo_Articulo', 'tipoArticulo')),
      ULTIMO_PRECIO: this.toNumber(this.pickValue(raw, 'ULTIMO_PRECIO', 'ultimoPrecio', 'UltimoPrecio')),
      TIENE_IMAGEN: Boolean(this.pickValue(raw, 'TIENE_IMAGEN', 'tieneImagen')),
      PRECIO_MAYOREO: this.toNumber(this.pickValue(raw, 'PRECIO_MAYOREO', 'precioMayoreo', 'PrecioMayoreo')),
      cantidadmayoreo: this.toNumber(this.pickValue(raw, 'cantidadmayoreo', 'cantidadMayoreo', 'CantidadMayoreo')),
      GRUPO_COD: this.toString(this.pickValue(raw, 'GRUPO_COD', 'grupo_Cod', 'grupoCod')),
      GRUPO_DESC: this.toString(this.pickValue(raw, 'GRUPO_DESC', 'grupo_Desc', 'grupoDesc')),
      UNIDAD_MEDIDA: this.toString(this.pickValue(raw, 'UNIDAD_MEDIDA', 'unidaD_MEDIDA', 'unidadMedida'))
    };
  }

  private mapFormaPago(raw: Record<string, unknown>): FormaPagoDto {
    return {
      Codigo: this.toString(this.pickValue(raw, 'Codigo', 'codigo')),
      Descripcion: this.toString(this.pickValue(raw, 'Descripcion', 'descripcion'))
    };
  }

  private mapFacturaFormaPago(raw: Record<string, unknown>): FacturaFormaPagoDto {
    return {
      IdFactura: this.toNumber(this.pickValue(raw, 'IdFactura', 'idFactura')),
      Codigo: this.toString(this.pickValue(raw, 'Codigo', 'codigo')),
      Descripcion: this.toString(this.pickValue(raw, 'Descripcion', 'descripcion')),
      Monto: this.toNumber(this.pickValue(raw, 'Monto', 'monto'))
    };
  }

  private mapRetencionCatalogo(raw: Record<string, unknown>): RetencionCatalogoDto {
    return {
      RETENCION: this.toString(this.pickValue(raw, 'RETENCION', 'retencion')),
      DESCRIPCION: this.toString(this.pickValue(raw, 'DESCRIPCION', 'descripcion'))
    };
  }

  private mapCondicionPagoCatalogo(raw: Record<string, unknown>): CondicionPagoCatalogoDto {
    return {
      CONDICION_PAGO: this.toString(this.pickValue(raw, 'CONDICION_PAGO', 'condicion_Pago', 'condicionPago')),
      DESCRIPCION: this.toString(this.pickValue(raw, 'DESCRIPCION', 'descripcion')),
      DIAS_CREDITO: this.toNumber(this.pickValue(raw, 'DIAS_CREDITO', 'dias_Credito', 'diasCredito'))
    };
  }

  private mapCcfParaNc(raw: Record<string, unknown>): CcfParaNcDto {
    return {
      Prefijo: this.toString(this.pickValue(raw, 'Prefijo', 'PREFIJO')),
      Factura: this.toString(this.pickValue(raw, 'Factura', 'FACTURA')),
      Sucursal: this.toString(this.pickValue(raw, 'Sucursal', 'SUCURSAL')),
      PuntoVenta: this.toString(this.pickValue(raw, 'PuntoVenta', 'PUNTO_VENTA')),
      Fecha: this.toString(this.pickValue(raw, 'Fecha', 'FECHA')),
      TotalFacturar: this.toNumber(this.pickValue(raw, 'TotalFacturar', 'TOTAL_FACTURAR')),
      Sumas: this.toNumber(this.pickValue(raw, 'Sumas', 'SUMAS')),
      TotalImpuesto1: this.toNumber(this.pickValue(raw, 'TotalImpuesto1', 'TOTAL_IMPUESTO1')),
      Cliente: this.toString(this.pickValue(raw, 'Cliente', 'CLIENTE')),
      FacturarA: this.toString(this.pickValue(raw, 'FacturarA', 'FACTURAR_A')),
      NumeroControl: this.toString(this.pickValue(raw, 'NumeroControl', 'Numero_Control')),
      CodigoGeneracion: this.toString(this.pickValue(raw, 'CodigoGeneracion')),
      TipoFactura: this.toString(this.pickValue(raw, 'TipoFactura', 'TIPO_FACTURA')),
      TotalRegistros: this.toNumber(this.pickValue(raw, 'TotalRegistros', 'TOTAL_REGISTROS'))
    };
  }

  private mapFacturaRetencion(raw: Record<string, unknown>): FacturaRetencionDto {
    return {
      TIPORETENCION: this.toString(this.pickValue(raw, 'TIPORETENCION', 'tipoRetencion')),
      RETENCION: this.toString(this.pickValue(raw, 'RETENCION', 'retencion')),
      Monto: this.toNumber(this.pickValue(raw, 'Monto', 'monto')),
      TIPO_OPERACION: this.toString(this.pickValue(raw, 'TIPO_OPERACION', 'TIPO OPERACION', 'tipoOperacion')),
      MONTO_MINIMO: this.toNumber(this.pickValue(raw, 'MONTO_MINIMO', 'montoMinimo'))
    };
  }

  private mapFacturaTotales(raw: Record<string, unknown>): FacturaTotalesDto {
    const precioConIvaRaw = this.pickValue(raw, 'PrecioConIVA', 'precioConIVA');

    return {
      TOTAL_IMPUESTO1: this.toNumber(this.pickValue(raw, 'TOTAL_IMPUESTO1', 'Total_Impuesto1', 'total_impuesto1')),
      TOTAL_IMPUESTO2: this.toNumber(this.pickValue(raw, 'TOTAL_IMPUESTO2', 'Total_Impuesto2', 'total_impuesto2')),
      TOTAL_IMPUESTO3: this.toNumber(this.pickValue(raw, 'TOTAL_IMPUESTO3', 'Total_Impuesto3', 'total_impuesto3')),
      SUMAS: this.toNumber(this.pickValue(raw, 'SUMAS', 'Sumas', 'sumas')),
      TotalOperacion: this.toNumber(this.pickValue(raw, 'TotalOperacion', 'TOTALOPERACION', 'totalOperacion')),
      SubTotalVentas: this.toNumber(this.pickValue(raw, 'SubTotalVentas', 'SUBTOTALVENTAS', 'subTotalVentas')),
      RETENCION: this.toNumber(this.pickValue(raw, 'RETENCION', 'Retencion', 'retencion')),
      TOTALIMPUESTOS: this.toNumber(this.pickValue(raw, 'TOTALIMPUESTOS', 'TotalImpuestos', 'totalImpuestos')),
      TOTAL_FACTURA: this.toNumber(this.pickValue(raw, 'TOTAL_FACTURA', 'TotalFactura', 'totalFactura')),
      ValorLetras: this.toString(this.pickValue(raw, 'ValorLetras', 'valorLetras')),
      PrecioConIVA: String(precioConIvaRaw).toLowerCase() === 'true' || precioConIvaRaw === true,
      DESCUENTO: this.toNumber(this.pickValue(raw, 'DESCUENTO', 'Descuento', 'descuento')),
      DescuentoAdicional: this.toNumber(this.pickValue(raw, 'DescuentoAdicional', 'descuentoAdicional')),
      DescuentoTotal: this.toNumber(this.pickValue(raw, 'DescuentoTotal', 'descuentoTotal'))
    };
  }

  getFacturasGeneral(desde: string, hasta: string): Observable<FacturaGeneralDto[]> {
    const desdeNormalized = String(desde ?? '').trim();
    const hastaNormalized = String(hasta ?? '').trim();
    const cacheKey = `facturasGeneral:${desdeNormalized}:${hastaNormalized}`;

    return this.getCachedRequest(
      cacheKey,
      () => {
        const params = new HttpParams().set('desde', desdeNormalized).set('hasta', hastaNormalized);
        return this.http
          .get<Array<Record<string, unknown>>>(`${this.facturaApiUrl}/GetFacturasGeneral`, { params })
          .pipe(map((rows) => (rows ?? []).map((item) => this.mapFacturaGeneral(item))));
      },
      this.shortCacheTtlMs
    );
  }

  getFacturaEncabezado(prefijo: string, factura: string, sucursal: string, puntoVenta: string, idEmpresa: number): Observable<FacturaEncabezadoDto> {
    const params = new HttpParams()
      .set('prefijo', prefijo)
      .set('factura', factura)
      .set('sucursal', sucursal)
      .set('puntoVenta', puntoVenta)
      .set('idEmpresa', idEmpresa);

    return this.http
      .get<Record<string, unknown>>(`${this.facturaApiUrl}/GetFacturaEncabezado`, { params })
      .pipe(map((row) => this.mapFacturaEncabezado(row ?? {})));
  }

  getFacturaDetalle(prefijo: string, factura: string, sucursal: string, puntoVenta: string, tipoFactura: string): Observable<FacturaDetalleDto[]> {
    const params = new HttpParams()
      .set('prefijo', prefijo)
      .set('factura', factura)
      .set('sucursal', sucursal)
      .set('puntoVenta', puntoVenta)
      .set('tipoFactura', tipoFactura);

    return this.http
      .get<Array<Record<string, unknown>>>(`${this.facturaApiUrl}/GetFacturaDetalle`, { params })
      .pipe(map((rows) => (rows ?? []).map((item) => this.mapFacturaDetalle(item))));
  }

  getFacturaTotales(idFactura: number): Observable<FacturaTotalesDto> {
    const params = new HttpParams().set('idFactura', idFactura);
    return this.http
      .get<Record<string, unknown>>(`${this.facturaApiUrl}/GetFacturaTotales`, { params })
      .pipe(map((row) => this.mapFacturaTotales(row ?? {})));
  }

  getSucursalPuntoVendedor(usuario: string): Observable<SucursalPuntoVendedorDto[]> {
    const usuarioNormalized = String(usuario ?? '').trim();
    const cacheKey = `catalogo:sucursalPunto:${usuarioNormalized}`;
    return this.getCachedRequest(cacheKey, () => {
      const params = new HttpParams().set('usuario', usuarioNormalized);
      return this.http
        .get<Array<Record<string, unknown>>>(`${this.facturaApiUrl}/GetSucursalPuntoVendedor`, { params })
        .pipe(map((rows) => (rows ?? []).map((item) => this.mapSucursalPuntoVendedor(item))));
    });
  }

  getPerfilClientes(): Observable<PerfilClienteDto[]> {
    return this.getCachedRequest('catalogo:perfilClientes', () =>
      this.http
        .get<Array<Record<string, unknown>>>(`${this.facturaApiUrl}/GetPerfilClientes`)
        .pipe(map((rows) => (rows ?? []).map((item) => this.mapPerfilCliente(item))))
    );
  }

  getArticulosPorBodega(bodega: string = 'BOD01'): Observable<ArticuloPorBodegaDto[]> {
    const bodegaNormalized = String(bodega || 'BOD01').trim() || 'BOD01';
    const cacheKey = `catalogo:articulos:${bodegaNormalized}`;
    return this.getCachedRequest(cacheKey, () => {
      const params = new HttpParams().set('bodega', bodegaNormalized);
      return this.http
        .get<Array<Record<string, unknown>>>(`${this.facturaApiUrl}/GetArticulosPorBodega`, { params })
        .pipe(map((rows) => (rows ?? []).map((item) => this.mapArticuloPorBodega(item))));
    }, this.shortCacheTtlMs);
  }

  // Precio y existencia VIGENTES de un artículo, consultados en línea (sin caché) al
  // seleccionarlo en fac-pos, para no depender del catálogo cargado al abrir la pantalla.
  getInfoVentaArticulo(articulo: string, bodega: string = 'BOD01'): Observable<InfoVentaArticuloDto> {
    const params = new HttpParams().set('articulo', articulo).set('bodega', bodega || 'BOD01');
    return this.http.get<InfoVentaArticuloDto>(`${this.facturaApiUrl}/GetInfoVentaArticulo`, { params });
  }

  getFormasPago(): Observable<FormaPagoDto[]> {
    return this.getCachedRequest('catalogo:formasPago', () =>
      this.http
        .get<Array<Record<string, unknown>>>(`${this.facturaApiUrl}/GetFormasPago`)
        .pipe(map((rows) => (rows ?? []).map((item) => this.mapFormaPago(item))))
    );
  }

  getFacturaFormaPago(idFactura: number): Observable<FacturaFormaPagoDto[]> {
    const params = new HttpParams().set('idFactura', idFactura);
    return this.http
      .get<Array<Record<string, unknown>>>(`${this.facturaApiUrl}/GetFacturaFormaPago`, { params })
      .pipe(map((rows) => (rows ?? []).map((item) => this.mapFacturaFormaPago(item))));
  }

  getCatalogoRetenciones(): Observable<RetencionCatalogoDto[]> {
    return this.getCachedRequest('catalogo:retenciones', () =>
      this.http
        .get<Array<Record<string, unknown>>>(`${this.facturaApiUrl}/GetCatalogoRetenciones`)
        .pipe(map((rows) => (rows ?? []).map((item) => this.mapRetencionCatalogo(item))))
    );
  }

  getCatalogoCondicionPago(): Observable<CondicionPagoCatalogoDto[]> {
    return this.getCachedRequest('catalogo:condicionPago', () =>
      this.http
        .get<Array<Record<string, unknown>>>(`${this.facturaApiUrl}/GetCatalogoCondicionPago`)
        .pipe(map((rows) => (rows ?? []).map((item) => this.mapCondicionPagoCatalogo(item))))
    );
  }

  // Catálogos de exportación (FEX)
  getCatalogoRecintoFiscal(): Observable<RecintoFiscalCatalogo[]> {
    return this.getCachedRequest('catalogo:recintoFiscal', () =>
      this.http
        .get<Array<Record<string, unknown>>>(`${this.facturaApiUrl}/GetCatalogoRecintoFiscal`)
        .pipe(map((rows) => (rows ?? []).map((r) => ({
          id: this.toNumber(this.pickValue(r, 'idRecintoFiscal', 'IdRecintoFiscal')),
          codigo: this.toString(this.pickValue(r, 'codigoRecintoFiscal', 'CodigoRecintoFiscal')),
          descripcion: this.toString(this.pickValue(r, 'descripcionRecintoFiscal', 'DescripcionRecintoFiscal'))
        }))))
    );
  }

  getCatalogoRegimenExportacion(): Observable<RegimenExportacionCatalogo[]> {
    return this.getCachedRequest('catalogo:regimenExportacion', () =>
      this.http
        .get<Array<Record<string, unknown>>>(`${this.facturaApiUrl}/GetCatalogoRegimenExportacion`)
        .pipe(map((rows) => (rows ?? []).map((r) => ({
          id: this.toNumber(this.pickValue(r, 'idRegimenExportacion', 'IdRegimenExportacion')),
          codigo: this.toString(this.pickValue(r, 'codigo', 'Codigo')),
          descripcion: this.toString(this.pickValue(r, 'regimenExportacionDescripcion', 'RegimenExportacionDescripcion'))
        }))))
    );
  }

  getCatalogoTipoRegimen(): Observable<TipoRegimenCatalogo[]> {
    return this.getCachedRequest('catalogo:tipoRegimen', () =>
      this.http
        .get<Array<Record<string, unknown>>>(`${this.facturaApiUrl}/GetCatalogoTipoRegimen`)
        .pipe(map((rows) => (rows ?? []).map((r) => ({
          codigo: this.toString(this.pickValue(r, 'codigo', 'Codigo')),
          descripcion: this.toString(this.pickValue(r, 'descripcion', 'Descripcion'))
        }))))
    );
  }

  getFacturaRetenciones(
    cliente: string,
    prefijo: string,
    factura: string,
    sucursal: string,
    puntoVenta: string,
    tipoRetencion: string
  ): Observable<FacturaRetencionDto[]> {
    const params = new HttpParams()
      .set('cliente', cliente)
      .set('prefijo', prefijo)
      .set('factura', factura)
      .set('sucursal', sucursal)
      .set('puntoVenta', puntoVenta)
      .set('tipoRetencion', tipoRetencion);

    return this.http
      .get<Array<Record<string, unknown>>>(`${this.facturaApiUrl}/GetFacturaRetenciones`, { params })
      .pipe(map((rows) => (rows ?? []).map((item) => this.mapFacturaRetencion(item))));
  }

  saveFac(payload: FacSavePayload): Observable<unknown> {
    return this.http.post(`${this.facturaApiUrl}/SaveFAC`, payload).pipe(
      tap(() => this.invalidateFacturasGeneralCache())
    );
  }

  updateFactura(payload: UpdateFacturaDto): Observable<unknown> {
    return this.http.post(`${this.facturaApiUrl}/UpdateFactura`, payload).pipe(
      tap(() => this.invalidateFacturasGeneralCache())
    );
  }

  updateFacturaRetencion(payload: UpdateFacturaRetencionDto): Observable<unknown> {
    return this.http.post(`${this.facturaApiUrl}/UpdateFacturaRetencion`, payload);
  }

  updateDetalleFactura(payload: UpdateDetalleFacturaDto): Observable<unknown> {
    return this.http.post(`${this.facturaApiUrl}/UpdateDetalleFactura`, payload);
  }

  updateFacturaFormaPago(payload: UpdateFacturaFormaPagoDto): Observable<unknown> {
    return this.http.post(`${this.facturaApiUrl}/UpdateFacturaFormaPago`, payload);
  }

  updatePrecioConIva(idFactura: number, precioConIva: boolean): Observable<unknown> {
    return this.http.post(`${this.facturaApiUrl}/PostPIVA`, { IdFactura: idFactura, PrecioConIva: precioConIva });
  }

  updatePagoRecibido(idFactura: number, monto: number, usuario: string): Observable<unknown> {
    return this.http.post(`${this.facturaApiUrl}/UpdatePagoRecibido`, { IdFactura: idFactura, Monto: monto, Usuario: usuario }).pipe(
      tap(() => this.invalidateFacturasGeneralCache())
    );
  }

  updateFacturacionAplicacion(payload: UpdateFacturacionAplicacionDto): Observable<unknown> {
    return this.http.post(`${this.facturaApiUrl}/UpdateFacturacionAplicacion`, payload, {
      responseType: 'text'
    }).pipe(
      tap(() => this.invalidateFacturasGeneralCache()),
      catchError((error: unknown) => {
        const detail = this.extractPlainTextError(error);

        if (detail) {
          return throwError(() => detail);
        }

        if (payload.TipoMtto === 'Aplicar' && error instanceof HttpErrorResponse && error.status === 500) {
          return throwError(() => 'No se pudo aplicar la factura. Verifique existencias disponibles; la API de produccion no devolvio el detalle del error.');
        }

        return throwError(() => error);
      })
    );
  }

  updateCambioTipoFactura(payload: UpdateCambioTipoFacturaDto): Observable<unknown> {
    return this.http.post(`${this.facturaApiUrl}/UpdateCambioTipoFactura`, payload).pipe(
      tap(() => this.invalidateFacturasGeneralCache())
    );
  }

  aplicarFac(idFactura: number): Observable<unknown> {
    return this.http.post(`${this.facturaApiUrl}/AplicarFAC`, { idFactura }).pipe(
      tap(() => this.invalidateFacturasGeneralCache())
    );
  }

  desaplicarFac(idFactura: number): Observable<unknown> {
    return this.http.post(`${this.facturaApiUrl}/DesaplicarFAC`, { idFactura }).pipe(
      tap(() => this.invalidateFacturasGeneralCache())
    );
  }

  anularFac(idFactura: number): Observable<unknown> {
    return this.http.post(`${this.facturaApiUrl}/AnularFAC`, { idFactura }).pipe(
      tap(() => this.invalidateFacturasGeneralCache())
    );
  }

  postDteAnulacion(apiBaseUrl: string, payload: ParametrosDteAnulacionDto): Observable<RespuestaDteDto> {
    return this.http
      .post<Record<string, unknown> | string>(this.join(apiBaseUrl, 'api/DteemitidosV2/PostAnulacion'), payload)
      .pipe(
        map((response) => {
          if (typeof response === 'string') {
            return { MensajeGeneral: String(response ?? '').trim() };
          }

          return this.mapRespuestaDte(response ?? {});
        })
      );
  }
getEmiteDte(idEmpresa:number): Observable<boolean> {
    const params = new HttpParams().set('idEmpresa', idEmpresa);
    return this.http
      .get<boolean>(`${this.facturaApiUrl}/GetEmiteDte`, { params })
      .pipe(map((response) => response === true),
      catchError(() =>{return of(false)})
      );
  }
  private extractPlainTextError(error: unknown): string {
    if (typeof error === 'string') {
      return String(error ?? '').trim();
    }

    if (!(error instanceof HttpErrorResponse)) {
      return '';
    }

    if (typeof error.error === 'string') {
      return String(error.error ?? '').trim();
    }

    if (typeof error.message === 'string') {
      const normalized = String(error.message ?? '').trim();
      if (normalized && !normalized.startsWith('Http failure response for ')) {
        return normalized;
      }
    }

    return '';
  }

  anularFactura(payload: AnulacionFacturaDto): Observable<unknown> {
    return this.http.post(`${this.facturaApiUrl}/AnularFactura`, payload).pipe(
      tap(() => this.invalidateFacturasGeneralCache())
    );
  }

  enviarDteAnulado(
    idEmpresa: number,
    tipoFactDescripcion: string,
    test: boolean,
    perfil: DatosDestinatarioDteDto
  ): Observable<unknown> {
    const params = new HttpParams()
      .set('idEmpresa', idEmpresa)
      .set('tipofact', String(tipoFactDescripcion ?? '').trim())
      .set('test', test ? 'true' : 'false');

    return this.http.post(this.join(this.mailDteApiUrl, 'api/Dte/enviar-dte-anulado'), perfil, { params });
  }

  deleteFactura(payload: DeleteFacturaDto): Observable<unknown> {
    return this.http.post(`${this.facturaApiUrl}/DeleteFactura`, payload).pipe(
      tap(() => this.invalidateFacturasGeneralCache())
    );
  }

  serviceAvailable(apiBaseUrl: string): Observable<string> {
    return this.http.get(`${this.join(apiBaseUrl, 'api/DteemitidosV2/ServiceAvailable')}`, { responseType: 'text' });
  }

  emitirDte(apiBaseUrl: string, payload: ParametrosDteDto, tipoFactura: string): Observable<RespuestaDteDto> {
    const tipo = String(tipoFactura ?? '').trim().toUpperCase() || 'FAC';
    return this.http
      .post<Record<string, unknown>>(this.join(apiBaseUrl, `api/DteemitidosV2/Post${tipo}`), payload)
      .pipe(map((row) => this.mapRespuestaDte(row ?? {})));
  }

  emitirFac(apiBaseUrl: string, payload: ParametrosDteDto): Observable<RespuestaDteDto> {
    return this.emitirDte(apiBaseUrl, payload, 'FAC');
  }

  estadoDte(apiBaseUrl: string, idEmpresa: number, fecha: string, codGeneracion: string): Observable<DteSelladoDto[]> {
    const params = new HttpParams()
      .set('idEmpresa', idEmpresa)
      .set('FDesde', this.toIsoDate(fecha))
      .set('FHasta', this.toIsoDate(fecha))
      .set('codGeneracion', String(codGeneracion ?? '').trim());

    return this.http
      .get<Array<Record<string, unknown>>>(this.join(apiBaseUrl, 'api/DteemitidosV2/GetDTEHaciendaSistema'), { params })
      .pipe(
        map((rows) =>
          (rows ?? []).map((row) => ({
            selloRecibido: this.toString(this.pickValue(row, 'selloRecibido', 'SelloRecibido', 'selloRecepcion', 'SelloRecepcion')),
            codigoGeneracion: this.toString(this.pickValue(row, 'codigoGeneracion', 'CodigoGeneracion', 'codGeneracion', 'CodGeneracion')),
            estado: this.toString(this.pickValue(row, 'estado', 'Estado'))
          }))
        )
      );
  }

  enviarCorreoDte(idEmpresa: number, idFactura: number, tipoFactura: string): Observable<string> {
    const params = new HttpParams()
      .set('idEmpresa', idEmpresa)
      .set('idFactura', idFactura)
      .set('tipoFactura', String(tipoFactura ?? '').trim().toUpperCase());

    return this.http.post(this.join(this.mailDteApiUrl, 'api/Dte/enviar-correo'), null, {
      params,
      responseType: 'text'
    });
  }

  reenviarCorreoDte(idEmpresa: number, idFactura: number, tipoFactura: string, correoDestino: string): Observable<string> {
    const params = new HttpParams()
      .set('idEmpresa', idEmpresa)
      .set('idFactura', idFactura)
      .set('tipoFactura', String(tipoFactura ?? '').trim().toUpperCase())
      .set('correoDestino', String(correoDestino ?? '').trim());

    return this.http.post(this.join(this.mailDteApiUrl, 'api/Dte/reenviar-correo'), null, {
      params,
      responseType: 'text'
    });
  }

  // Envío directo (sin maildte.kulstoresv.com) para documentos registrados en ambiente 0:
  // el PDF ya viene generado en el navegador (ReciboService), el backend solo lo manda por SMTP.
  enviarReciboDirecto(idEmpresa: number, idFactura: number, tipoFactura: string, correoDestino: string, pdfBase64: string, nombreArchivo?: string): Observable<unknown> {
    return this.http.post(`${this.facturaApiUrl}/EnviarReciboDirecto`, {
      IdEmpresa: idEmpresa,
      IdFactura: idFactura,
      TipoFactura: String(tipoFactura ?? '').trim().toUpperCase(),
      CorreoDestino: String(correoDestino ?? '').trim(),
      PdfBase64: pdfBase64,
      NombreArchivo: nombreArchivo ?? null
    });
  }

  previewDte(idEmpresa: number, idFactura: number, tipoFactura: string, emitido: boolean): Observable<string> {
    const tipo = String(tipoFactura ?? '').trim().toUpperCase() || 'FAC';
    const emitidoSegment = emitido ? 'true' : 'false';
    const path = `api/Dte/preview/${idEmpresa}/${idFactura}/${tipo}/${emitidoSegment}`;

    return this.http.get(this.join(this.mailDteApiUrl, path), {
      responseType: 'text'
    });
  }

  getPreviewDteUrl(idEmpresa: number, idFactura: number, tipoFactura: string, emitido: boolean): string {
    const tipo = String(tipoFactura ?? '').trim().toUpperCase() || 'FAC';
    const emitidoSegment = emitido ? 'true' : 'false';
    const path = `api/Dte/preview/${idEmpresa}/${idFactura}/${tipo}/${emitidoSegment}`;
    return this.join(this.mailDteApiUrl, path);
  }

  verificarSecuencias(dto: VerificarSecuenciasDto): Observable<{ message: string }> {
    return this.http
      .post<Record<string, unknown> | null>(`${this.facturaApiUrl}/VerificarSecuencias`, dto)
      .pipe(
        map((row) => ({
          message:
            this.toString(this.pickValue(row ?? {}, 'message', 'Message', 'mensaje')) ||
            'Secuencia validada'
        }))
      );
  }

  private mapRespuestaDte(raw: Record<string, unknown>): RespuestaDteDto {
    return {
      idDTE: this.toNumber(this.pickValue(raw, 'idDTE', 'IdDTE', 'IDDTE')),
      SelloRecepcion: this.toString(this.pickValue(raw, 'SelloRecepcion', 'selloRecepcion', 'selloRecibido')),
      NoControl: this.toString(this.pickValue(raw, 'NoControl', 'noControl')),
      CodigoGeneracion: this.toString(this.pickValue(raw, 'CodigoGeneracion', 'codigoGeneracion', 'codGeneracion', 'CodGeneracion')),
      MensajeGeneral: this.toString(this.pickValue(raw, 'MensajeGeneral', 'mensajeGeneral', 'message')),
      ...raw
    };
  }

  private toIsoDate(value: string): string {
    const text = String(value ?? '').trim();
    const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }

    const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (slashMatch) {
      const first = Number(slashMatch[1]);
      const second = Number(slashMatch[2]);
      const year = slashMatch[3];
      const month = first > 12 ? second : first;
      const day = first > 12 ? first : second;
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    return text;
  }

  private join(baseUrl: string, path: string): string {
    const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
    return `${base}/${normalizedPath}`;
  }

  getNotasCredito(desde: string, hasta: string): Observable<FacturaGeneralDto[]> {
    const desdeNormalized = String(desde ?? '').trim();
    const hastaNormalized = String(hasta ?? '').trim();
    const cacheKey = `notasCredito:${desdeNormalized}:${hastaNormalized}`;

    return this.getCachedRequest(
      cacheKey,
      () => {
        const params = new HttpParams().set('desde', desdeNormalized).set('hasta', hastaNormalized);
        return this.http
          .get<Array<Record<string, unknown>>>(`${this.facturaApiUrl}/GetNotasCredito`, { params })
          .pipe(map((rows) => (rows ?? []).map((item) => this.mapFacturaGeneral(item))));
      },
      this.shortCacheTtlMs
    );
  }

  getCcfsPorCliente(cliente: string, pagina: number = 1, busqueda: string = ''): Observable<CcfParaNcDto[]> {
    let params = new HttpParams()
      .set('cliente', String(cliente ?? '').trim())
      .set('pagina', pagina)
      .set('tamanioPagina', 25);
    if (busqueda) {
      params = params.set('busqueda', busqueda);
    }
    return this.http
      .get<Array<Record<string, unknown>>>(`${this.facturaApiUrl}/GetCcfsPorCliente`, { params })
      .pipe(map((rows) => (rows ?? []).map((item) => this.mapCcfParaNc(item))));
  }

  getCcfVinculadoNc(prefijo: string, factura: string, sucursal: string, puntoVenta: string): Observable<CcfParaNcDto | null> {
    const params = new HttpParams()
      .set('prefijo', prefijo)
      .set('factura', factura)
      .set('sucursal', sucursal)
      .set('puntoVenta', puntoVenta);
    return this.http
      .get<Record<string, unknown> | null>(`${this.facturaApiUrl}/GetCcfVinculadoNc`, { params })
      .pipe(map((row) => (row ? this.mapCcfParaNc(row) : null)));
  }

  getAplicaInventarios(): Observable<boolean> {
    return this.getCachedRequest(
      'config:aplicaInventarios',
      () => this.http.get<boolean>(`${this.facturaApiUrl}/GetAplicaInventarios`).pipe(
        map((v) => v === true),
        catchError(() => of(false))
      )
    );
  }

  updateDetalleFacturaDescuento(payload: UpdateDetalleFacturaDescuentoDto): Observable<unknown> {
    return this.http.post(`${this.facturaApiUrl}/UpdateDetalleFacturaDescuento`, payload);
  }

  updateFacturaDevolucion(payload: UpdateFacturaDevolucionDto): Observable<unknown> {
    return this.http.post(`${this.facturaApiUrl}/UpdateFacturaDevolucion`, payload).pipe(
      tap(() => this.invalidateFacturasGeneralCache())
    );
  }

  getMinimoGlobalMayoreo(): Observable<number> {
    return this.http.get<number>(`${this.facturaApiUrl}/GetMinimoGlobalMayoreo`);
  }

  setMinimoGlobalMayoreo(minimo: number): Observable<unknown> {
    return this.http.post(`${this.facturaApiUrl}/SetMinimoGlobalMayoreo`, { Minimo: minimo });
  }
}
