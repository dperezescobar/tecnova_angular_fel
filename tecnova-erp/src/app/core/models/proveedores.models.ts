export interface ProveedorListadoDTO {
  PROVEEDOR: string;
  NOMBRE: string;
  ALIAS: string;
  NIT: string;
  ORIGEN: string;
  ACTIVO?: string;
}

export interface CorrelativoResponse {
  correlativo: string;
}

export interface CatalogOptionDTO {
  value: string | number;
  label: string;
}

export interface TipoRetencionDTO {
  RETENCION: string;
  DESCRIPCION: string;
}

export interface RetencionDTO {
  RETENCION: string;
  DESCRIPCION: string;
}

export interface ProveedorDetalleDTO {
  PROVEEDOR: string;
  NOMBRE: string;
  ALIAS: string;
  ORIGEN: 'L' | 'E';
  DIRECCION: string;
  IDPAIS: number;
  IDDEPARTAMENTO: string;
  IDMUNICIPIO: string;
  TELEFONO: string;
  NIT: string;
  NRC: string;
  EMAIL: string;
  CONDICION_PAGO: string;
  ACTIVO: boolean;
  IDGIRO: string;
  DUI: string;
  TIPOPERSONA: number;
  OBSERVACION: string;
  ACTIVIDAD: string;
}

export interface ProveedorUpdateDTO {
  PROVEEDOR: string;
  NOMBRE: string;
  ALIAS: string;
  ORIGEN: 'L' | 'E';
  DIRECCION: string;
  IDPAIS: number;
  IDDEPARTAMENTO: string;
  IDMUNICIPIO: string;
  TELEFONO: string;
  NIT: string;
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
  ACTIVIDAD: string;
}

export interface ProveedorOperationResponse {
  success: boolean;
}
