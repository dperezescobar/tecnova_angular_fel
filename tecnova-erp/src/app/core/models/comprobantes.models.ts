export interface CRListadoDto {
  ID: number;
  FECHA: string;
  PROVEEDOR: string;
  NOMBRE: string;
  REGISTRO_COMERCIO: string | null;
  NIT: string;
  TOTAL: number;
  TOTAL_RETENCION: number;
  ESTADO: string;
  NoControl: string | null;
  CodigoGeneracion: string | null;
  SelloRecepcion: string | null;
}

export interface CREncabezadoDto {
  CORREL: number;
  ID?: number;
  COMPROBANTE: string;
  PROVEEDOR: string;
  NOMBRE: string;
  FECHA: string;
  FECHA_COMPROBANTE: string;
  OBSERVACION: string;
  CONDICION_PAGO: string;
  NUMERO_RESOLUCION: string;
  ESTADO: string;
  NoControl: string;
  SelloRecepcion: string;
  CodGeneracion: string;
  CodigoGeneracion?: string;
}

export interface CRDetalleDto {
  LINEA: number;
  CODIGO_RETENCION: string;
  DESCRIPCION: string;
  MONTO: number;
  RETENCION: number;
  TipoDocumentoRelacionado: string;
  DocumentoRelacionado: string;
  SelloRecepcion: string;
  FECHA: string;
  TotalRetencion?: number;
}

export interface CRSaveDto {
  COMPROBANTE: string;
  PROVEEDOR: string;
  FECHA: string;
  FECHA_COMPROBANTE: string;
  OBSERVACION: string;
  CONDICION_PAGO: string;
  NUMERO_RESOLUCION: string;
  ID: number;
}

export interface CRDetalleSaveDto {
  Correl: number;
  COMPROBANTE: string;
  PROVEEDOR: string;
  PORC_RETENCION: number;
  DESCRIPCION: string;
  MONTO: number;
  RETENCION: number;
  FECHA: string;
  TipoDocumentoRelacionado: string;
  SelloRecepcion: string;
  DocumentoRelacionado: string;
}

export interface CRDetalleDeleteDto {
  Correl: number;
  PROVEEDOR: string;
  CODIGO_RETENCION: string;
  LINEA: number;
}

export interface PerfilProveedorDto {
  Proveedor: string;
  NOMBRE: string;
  ALIAS: string;
  NIT: string;
  DUI: string;
  REGISTRO_COMERCIO: string;
  Giro: string;
  CORREO_ELECTRONICO: string;
  Pais: string;
  Departamento: string;
  Municipio?: string;
  MUNICIPIO?: string;
  DIRECCION: string;
}

export interface ProveedorBusquedaDto {
  PROVEEDOR: string;
  NOMBRE: string;
  NIT: string;
}

export interface CDListadoDto {
  idFactura: number;
  PREFIJO: string;
  FACTURA: string;
  Estado: string;
  FECHA: string;
  CLIENTE: string;
  NOMBRE: string;
  TOTAL: number;
  NoControl: string;
  CodGeneracion: string;
  SelloRecepcion: string;
}

export interface CDEncabezadoDto {
  idFactura: number;
  PREFIJO: string;
  FACTURA: string;
  SUCURSAL: string;
  PUNTO_VENTA: string;
  TIPO_FACTURA: string;
  TIPO_VENTA: string;
  CLIENTE: string;
  FACTURAR_A: string;
  FECHA: string;
  CONDICION_PAGO: string;
  VENDEDOR: string;
  OBSERVACIONES: string;
  NIT: string;
  NRC: string;
  Estado: string;
  TOTAL_FACTURA: number;
  NoControl: string;
  SelloRecepcion: string;
  CodGeneracion: string;
  codDocAsociado: string;
  descDocumento: string;
  detalleDocumento: string;
}

export interface CDDetalleDto {
  ID: number;
  ARTICULO: string;
  DESCRIPCION: string;
  CANTIDAD: number;
  PRECIO_UNITARIO: number;
  TOTAL: number;
  UNIDAD_MEDIDA: string;
  TipoDonacion: number;
  Depreciacion: number;
}

export interface CDSaveDto {
  PREFIJO: string;
  FACTURA: string;
  CLIENTE: string;
  FACTURAR_A: string;
  FECHA: string;
  CONDICION_PAGO: string;
  OBSERVACIONES: string;
  TipoMtto: string;
  SubTotal: number;
  NIT: string;
  Registro_Comercio: string;
  CorreoCliente: string;
  codDocAsociado: string;
  descDocumento: string;
  detalleDocumento: string;
}

export interface CDDetalleSaveDto {
  PREFIJO: string;
  FACTURA: string;
  Cantidad: number;
  Articulo: string;
  Descripcion: string;
  PrecioUnitario: number;
  Unidad_Medida: string;
  Linea: number;
  SubTotal: number;
  TipoDonacion: number;
  Depreciacion: number;
}

export interface CDDetalleDeleteDto {
  PREFIJO: string;
  FACTURA: string;
  LINEA: number;
  SubTotal: number;
}

export interface CDAplicarDto {
  PREFIJO: string;
  FACTURA: string;
  Aplicar: boolean;
}

export interface CDAnularDto {
  idFactura: number;
  ComentarioAnulacion: string;
}

export interface CDFormaPagoDto {
  idFactura: number;
  codigo: string;
  Monto: number;
  TipoMtto: string;
}

export interface TipoDonacionDto {
  ID: number;
  Descripcion: string;
}

export interface FormaPagoCatalogoDto {
  codigo: string;
  Descripcion: string;
}

export interface FormaPagoDocDto {
  CODIGO: string;
  DESCRIPCION: string;
  MONTO: number;
}
