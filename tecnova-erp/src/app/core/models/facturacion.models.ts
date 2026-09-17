export interface FacturaGeneralDto {
  CLIENTE: string;
  CodGeneracion: string;
  CODIGOSUCURSAL: string;
  ESTADO: string;
  FACTURAR_A: string;
  FACTURA_INTERNA: string;
  FECHA: string;
  iddoc: string;
  Modulo_CXC: string;
  NoControl: string;
  PARTIDA: string;
  PUNTO_VENTA: string;
  SelloRecepcion: string;
  SUCURSAL: string;
  Tipo_Factura: string;
  TOTAL: string;
  Prefijo: string;
  Factura: string;
  Observacion: string;
  idDTE: number;
  pago: string;
}

export interface FacturaKeysDto {
  Prefijo: string;
  Factura: string;
  Sucursal: string;
  PuntoVenta: string;
  TipoFactura: string;
  Fecha: string;
  FacturarA: string;
}

export interface UpdatePagoRecibidoDto {
  IdFactura: number;
  Monto: number;
  Usuario: string;
}

export interface FacturaEncabezadoDto {
  IdFactura: number;
  Sucursal: string;
  PuntoVenta: string;
  Estado: string;
  Vendedor: string;
  Fecha: string;
  Cliente: string;
  FacturarA: string;
  Nombre: string;
  NIT: string;
  Identificacion: string;
  RegistroComercio: string;
  NombreComercial: string;
  Giro: string;
  CorreoElectronico: string;
  Pais: string;
  Departamento: string;
  Municipio: string;
  Direccion: string;
  IdRecintoFiscal: number;
  IdRegimenExportacion: number;
  TipoRegimen: string;
  Flete: number;
  Seguro: number;
  TipoVenta: string;
  TipoFactura: string;
  CondicionPago: string;
  Prefijo: string;
  Factura: string;
  Observaciones: string;
  TotalImpuesto1: number;
  Sumas: number;
  Retencion: number;
  TotalFactura: number;
  ValorLetras: string;
  NoControl: string;
  SelloRecepcion: string;
  CodGeneracion: string;
  IdDTE: number;
  PrecioConIVA: boolean;
  Proveedor: string;
  NombreProveedor: string;
  TotalOperacion: number;
  DescuentoAdicional: number;
  SubTotalVentas: number;
}

export interface FacturaTotalesDto {
  TOTAL_IMPUESTO1: number;
  TOTAL_IMPUESTO2: number;
  TOTAL_IMPUESTO3: number;
  SUMAS: number;
  TotalOperacion: number;
  SubTotalVentas: number;
  RETENCION: number;
  TOTALIMPUESTOS: number;
  TOTAL_FACTURA: number;
  ValorLetras: string;
  PrecioConIVA: boolean;
  DESCUENTO: number;
  DescuentoAdicional: number;
  DescuentoTotal: number;
}

export interface FacturaDetalleDto {
  LINEA: number;
  ARTICULO: string;
  DESCRIPCION: string;
  CALIDAD: string;
  CANTIDAD: number;
  PRECIO_UNITARIO: number;
  COSTO_UNITARIO: number;
  TOTAL: number;
  UNIDAD_MEDIDA: string;
  BODEGA: string;
  CENTROCOSTOINVENTARIO: string;
  CUENTACONTABLEINVENTARIO: string;
  TIPO_ARTICULO: string;
  CANTIDAD_KARDEX: number;
  UNIDAD_MEDIDA_KARDEX: string;
  ID_COLOR: number;
  COLOR: string;
  IdAcabado: string;
  Acabado: string;
  TIPO_COLOR: string;
  TipoDescuento: string;
  Descuento: number;
  TotalVenta: number;
}

// Catálogos de exportación (FEX)
export interface RecintoFiscalCatalogo {
  id: number;
  codigo: string;
  descripcion: string;
}

export interface RegimenExportacionCatalogo {
  id: number;
  codigo: string;
  descripcion: string;
}

export interface TipoRegimenCatalogo {
  codigo: string;
  descripcion: string;
}

export interface SucursalPuntoVendedorDto {
  CODIGO: string;
  codigoMHPV: string;
  CodigoMHSC: string;
  NOMBRE: string;
  NombrePV: string;
  NombreSC: string;
  PUNTO_VENTA: string;
  Sucursal: string;
  UsuarioAsignado: string;
  ID_EMPRESA: string;
  BodegaAsignada: string | null;
}

export interface PerfilClienteDto {
  CLIENTE: string;
  NOMBRE: string;
  NIT: string;
  IDENTIFICACION: string;
  REGISTRO_COMERCIO: string;
  CONDICION_PAGO: string;
  VENDEDOR: string;
  Giro: string;
  CORREO_ELECTRONICO: string;
  Pais: string;
  Departamento: string;
  Municipio: string;
  DIRECCION: string;
}

export interface ArticuloPorBodegaDto {
  ARTICULO: string;
  DESCRIPCION: string;
  TIPO_ARTICULO: string;
  ULTIMO_PRECIO: number;
  TIENE_IMAGEN: boolean;
  PRECIO_MAYOREO: number;
  cantidadmayoreo: number;
  // POS híbrido (opcionales; sólo presentes tras el ALTER del catálogo).
  GRUPO_COD?: string;
  GRUPO_DESC?: string;
  UNIDAD_MEDIDA?: string;
}

export interface InfoVentaArticuloDto {
  ultimoPrecio: number;
  precioMayoreo: number;
  cantidadMayoreo: number;
  existencia: number;
}

export interface FormaPagoDto {
  Codigo: string;
  Descripcion: string;
}

export interface FacturaFormaPagoDto {
  IdFactura: number;
  Codigo: string;
  Descripcion: string;
  Monto: number;
}

export interface RetencionCatalogoDto {
  RETENCION: string;
  DESCRIPCION: string;
}

export interface CondicionPagoCatalogoDto {
  CONDICION_PAGO: string;
  DESCRIPCION: string;
  DIAS_CREDITO: number;
}

export interface FacturaRetencionDto {
  TIPORETENCION: string;
  RETENCION: string;
  Monto: number;
  TIPO_OPERACION: string;
  MONTO_MINIMO: number;
}

export interface ParametrosDteDto {
  idFactura: number;
  idEmpresa: number;
  ambiente: string;
  codEstablecimiento: string;
  codPuntoVenta: string;
  user: string;
}

export interface MotivoAnulacionDteDto {
  tipoAnulacion: number;
  motivoAnulacion: string;
  nombreResponsable: string;
  tipDocResponsable: string;
  numDocResponsable: string;
  nombreSolicita: string;
  tipDocSolicita: string;
  numDocSolicita: string;
}

export interface ParametrosDteAnulacionDto {
  idEmpresa: number;
  idFactura: number;
  ambiente: string;
  codEstablecimiento: string;
  codPuntoVenta: string;
  motivo: MotivoAnulacionDteDto;
  user: string;
}

export interface AnulacionFacturaDto {
  codGeneracion: string;
  Sucursal: string;
  PuntoVenta: string;
  TipoFactura: string;
  ComentarioAnulacion: string;
  usuario: string;
}

export interface DatosDestinatarioDteDto {
  nombre: string;
  NombreComercialEmpresa: string;
  fecEmi: string;
  nitemisor: string;
  numeroControl: string;
  codigoGeneracion: string;
  sellorecepcion: string;
  totalPagar: number;
  correoDestino: string;
}

export interface UpdateFacturacionAplicacionDto {
  CodGeneracion: string;
  Sucursal: string;
  PuntoVenta: string;
  TipoFactura: string;
  Usuario: string;
  IdEmpresa: number;
  TipoMtto: string;
}

export interface UpdateCambioTipoFacturaDto {
  IdFactura: number;
  TipoFactura: string;
  IdEmpresa: number;
}

export interface VerificarSecuenciasDto {
  IdEmpresa: number;
  AmbienteEmision: string;
  TipoFactura: string;
  TipoDoc: string;
}

export interface DeleteFacturaDto {
  Prefijo: string;
  Factura: string;
  Sucursal: string;
  PuntoVenta: string;
  TipoFactura: string;
  Fecha: string;
}

export interface RespuestaDteDto {
  idDTE?: number;
  SelloRecepcion?: string;
  NoControl?: string;
  CodigoGeneracion?: string;
  MensajeGeneral?: string;
  [key: string]: unknown;
}

export interface DteSelladoDto {
  selloRecibido?: string;
  codigoGeneracion?: string;
  estado?: string;
  [key: string]: unknown;
}

export interface EmisionStep {
  key: string;
  label: string;
  status: 'pending' | 'running' | 'ok' | 'error';
  detail?: string;
}

export interface FacSavePayload {
  encabezado: Partial<FacturaEncabezadoDto>;
  detalle: FacturaDetalleDto[];
}

export interface UpdateFacturaDto {
  CodGeneracion: string;
  Sucursal: string;
  PuntoVenta: string;
  TipoVenta: string;
  Cliente: string;
  FacturarA: string;
  Fecha: string;
  CondicionPago: string;
  Vendedor: string;
  Observaciones: string;
  Usuario: string;
  TipoMtto: string;
  Contabilizar: number;
  SubTotal: number;
  IVA: number;
  Impuesto2: number;
  Impuesto3: number;
  Retencion: number;
  NIT: string;
  RegistroComercio: string;
  NumeroResolucion: string;
  ExistenciaFecDoc: number;
  NumeroControl: string;
  SelloRecepcion: string;
  JSON: string;
  IdCondicionTraslado: string;
  NombreEntrega: string;
  IdentificacionEntrega: string;
  NombreRecibe: string;
  IdentificacionRecibe: string;
  TipoDestinoRemision: string;
  Proveedor: string;
  IdModoTransporte: number;
  NombreConductor: string;
  NumeroConductor: string;
  PlacaTransporte: string;
  IdRecintoFiscal: number;
  IdIncoterm: number;
  IdRegimenExportacion: number;
  TipoRegimen?: string;
  PrecioConIVA: number;
  Flete: number;
  Seguro: number;
  DescuentoAdicional: number;
  DTE: number;
  CorreoCliente: string;
  TipoFactura: string;
  // POS híbrido - Fase 2 (opcional; default false en el backend, no afecta otros callers).
  EsRecibo?: boolean;
}

export interface UpdateFacturaRetencionDto {
  CodGeneracion: string;
  Sucursal: string;
  PuntoVenta: string;
  TipoFactura: string;
  Retencion: string;
  Monto: number;
  TipoMtto: string;
  Usuario: string;
  SubTotal: number;
  IVA: number;
  Impuesto2: number;
  Impuesto3: number;
  RetencionFactura: number;
}

export interface UpdateDetalleFacturaDto {
  CodGeneracion: string;
  Sucursal: string;
  PuntoVenta: string;
  TipoFactura: string;
  Cantidad: number;
  Articulo: string;
  Descripcion: string;
  PrecioUnitario: number;
  CostoUnitario: number;
  Calidad: string;
  Bodega: string;
  UnidadMedida: string;
  Usuario: string;
  TipoMtto: string;
  Linea: number;
  SubTotal: number;
  IVA: number;
  Impuesto2: number;
  Impuesto3: number;
  Retencion: number;
  TipoColor: string;
  CantidadConversion: number;
  UnidadMedidaConversion: string;
  IdColor: number;
  IdAcabado: string;
}

export interface UpdateFacturaFormaPagoDto {
  IdFactura: number;
  Codigo: string;
  Monto: number;
  TipoMtto: string;
}

export interface UpdatePrecioConIvaDto {
  IdFactura: number;
  PrecioConIva: boolean;
}

export interface CcfParaNcDto {
  Prefijo: string;
  Factura: string;
  Sucursal: string;
  PuntoVenta: string;
  Fecha: string;
  TotalFacturar: number;
  Sumas: number;
  TotalImpuesto1: number;
  Cliente: string;
  FacturarA: string;
  NumeroControl: string;
  CodigoGeneracion: string;
  TipoFactura: string;
  TotalRegistros: number;
}

export interface UpdateDetalleFacturaDescuentoDto {
  CodGeneracion: string;
  Sucursal: string;
  PuntoVenta: string;
  TipoFactura: string;
  Cantidad: number;
  Articulo: string;
  Descripcion: string;
  PrecioUnitario: number;
  CostoUnitario: number;
  Calidad: string;
  Bodega: string;
  UnidadMedida: string;
  Usuario: string;
  TipoMtto: string;
  Linea: number;
  SubTotal: number;
  IVA: number;
  Impuesto2: number;
  Impuesto3: number;
  Retencion: number;
  TipoDescuento: string;
  Descuento: number;
  TipoColor: string;
  IdColor: number;
  IdAcabado: string;
}

export interface UpdateFacturaDevolucionDto {
  PrefijoNc: string;
  FacturaNc: string;
  SucursalNc: string;
  PuntoVentaNc: string;
  TipoFacturaNc: string;
  PrefijoCcf: string;
  FacturaCcf: string;
  SucursalCcf: string;
  PuntoVentaCcf: string;
  TipoFacturaCcf: string;
  TipoMtto: string;
  Usuario: string;
}

export type NcModo = 'DESCUENTO' | 'DEVOLUCION';

// ── POS Híbrido - Fase 2: recibos consolidables (opt-in, ver PosHibridoConfig.Activo) ──────────
export type PosModoDocumento = 'FACTURA_DIRECTA' | 'RECIBO';

export interface PosHibridoConfigDto {
  idEmpresa: number;
  activo: boolean;
}

export interface PosRubroConfigDto {
  grupoInventario1: string;
  modoDocumento: PosModoDocumento;
  activo: boolean;
}

export interface PosUsuarioRubroDto {
  usuario: string;
  grupoInventario1: string;
  permitido: boolean;
}

export interface ReciboPendienteDto {
  idFactura: number;
  prefijo: string;
  factura: string;
  sucursal: string;
  puntoVenta: string;
  fecha: string;
  cliente: string;
  facturarA: string;
  total: number;
  vendedor: string;
  rubros: string[];
}

export interface ConsolidacionResultDto {
  idFacturaConsolidada: number;
  prefijo: string;
  factura: string;
  sucursal: string;
  puntoVenta: string;
  total: number;
  origenes: ReciboPendienteDto[];
}
