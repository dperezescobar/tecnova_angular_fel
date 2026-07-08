export interface Sucursal {
  sucursal: string;
  descripcion: string;
  direccion: string;
  telefono: string;
  responsable: string;
  codigoMH: string;
}

export interface SucursalUpsertRequest {
  sucursal: string;
  descripcion: string;
  direccion: string;
  telefono: string;
  responsable: string;
  codigoMH: string;
}

export interface PuntoVentaListado {
  puntoVenta: string;
  sucursal: string;
  descripcion: string;
  sucursalDescripcion: string;
  codigoMH: string;
  condicionPago: string;
}

export interface PuntoVentaUpsertRequest {
  puntoVenta: string;
  sucursal: string;
  descripcion: string;
  codigoMH: string;
  condicionPago: string;
}

export interface CondicionPago {
  condicionPago: string;
  descripcion: string;
  diasCredito: number;
}

export interface Vendedor {
  vendedor: string;
  nombre: string;
}

export interface VendedorPuntoVenta {
  vendedor: string;
  nombre: string;
}
