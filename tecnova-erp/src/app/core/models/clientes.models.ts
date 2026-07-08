export interface ClienteListadoDTO {
  CLIENTE: string;
  NOMBRE: string;
  ALIAS: string;
  NIT: string;
  REGISTRO_COMERCIO: string;
  Pais: string;
  MUNICIPIO: string;
  DEPTO: string;
  ACTIVO: string;
  CLIENTE_PREFERENCIAL?: boolean;
  CANTIDAD_MINIMA?: number;
}

export interface CorrelativoResponse {
  correlativo: string;
}

export interface TipoClienteDTO {
  TIPO_CLIENTE: string;
  DESCRIPCION: string;
}

export interface CatalogOptionDTO {
  value: string | number;
  label: string;
}

export interface ClienteDetalleDTO {
  CLIENTE: string;
  NOMBRE: string;
  ALIAS: string;
  ORIGEN: 'L' | 'E';
  DIRECCION: string;
  IDPAIS: number;
  IDDEPARTAMENTO: string;
  IDMUNICIPIO: string;
  TELEFONO: string;
  NIT: string;
  DUI: string;
  REGISTRO_COMERCIO: string;
  CORREO_ELECTRONICO: string;
  CONDICION_PAGO: string;
  TIPO_CLIENTE: string;
  ACTIVO: boolean;
  idGiro: string;
  TipoPersona: number;
  OBSERVACION_CLIE: string;
  CLIENTE_PREFERENCIAL: boolean;
  CANTIDAD_MINIMA: number;
}

export interface ClienteUpdateDTO {
  CLIENTE: string;
  NOMBRE: string;
  ALIAS: string;
  ORIGEN: 'L' | 'E';
  DIRECCION: string;
  IDPAIS: number;
  IDDEPARTAMENTO: string;
  IDMUNICIPIO: string;
  TELEFONO: string;
  NIT: string;
  ACTIVIDAD: string;
  NRC: string;
  CONDICION_PAGO: string;
  ACTIVO: boolean;
  USUARIO: string;
  EMAIL: string;
  MODIFICADO: number;
  DUI: string;
  IDGIRO: string;
  TIPOPERSONA: number;
  OBSERVACION: string;
  TipoMtto: 'A' | 'C';
  tipoCliente: string;
  CLIENTE_PREFERENCIAL: boolean;
  CANTIDAD_MINIMA: number;
}

export interface ClienteOperationResponse {
  success: boolean;
}
