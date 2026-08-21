export interface TipoPrecioItem {
  tipoPrecioID: number;
  nombre: string;
  descripcion: string;
  esMayoreo: boolean;
}

export interface ArticuloPrecioItem {
  articuloPrecioID: number;
  articulo: string;
  articuloDescripcion: string;
  tipoPrecioID: number;
  tipoPrecioNombre: string;
  precio: number;
  cantidadMinima: number;
  fechaInicio?: string | null;
  fechaFin?: string | null;
  usuarioID?: string;
  fechaRegistro?: string;
}

export interface UpsertPrecioRequest {
  articulo: string;
  tipoPrecioID: number;
  precio: number;
  cantidadMinima: number;
  fechaInicio?: string | null;
  fechaFin?: string | null;
}

export interface PromocionItem {
  idArticuloDescuento: number;
  articulo: string;
  articuloDescripcion: string;
  tipoDescuento: string; // 'P' (%) o 'M' ($)
  valorDescuento: number;
  fdesde: string;
  fHasta: string;
  estado: string; // 'Activa', 'Programada', 'Vencida', 'Inactiva'
  activo: boolean;
}

export interface UpsertPromocionRequest {
  idArticuloDescuento?: number;
  articulo: string;
  tipoDescuento: string;
  valorDescuento: number;
  fdesde: string;
  fHasta: string;
  activo?: boolean;
}

export interface CrossSellingItem {
  crossSellingID: number;
  articuloPrincipalID: string;
  articuloPrincipalNombre: string;
  articuloSugeridoID: string;
  articuloSugeridoNombre: string;
  descuentoSugerido: number;
  tipoDescuento: string;
  mensajeSugerido: string;
  activo: boolean;
}

export interface UpsertCrossSellingRequest {
  crossSellingID?: number;
  articuloPrincipalID: string;
  articuloSugeridoID: string;
  descuentoSugerido: number;
  tipoDescuento: string;
  mensajeSugerido: string;
  activo?: boolean;
}
