export interface ArticuloPrecioGuardarRequest {
  articulo: string;
  tipoPrecioID: number;
  precio: number;
  cantidadMinima: number;
  usuario: string;
}