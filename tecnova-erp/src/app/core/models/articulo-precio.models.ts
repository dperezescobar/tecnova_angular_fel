export interface ArticuloPrecioGuardarRequest {
  articulo: string;
  tipoPrecioID: number;
  precio: number;
  cantidadMinima: number;
  usuario: string;
}

export interface ArticuloPrecioVigenteResponse {
  articulo: string;
  tipoPrecio: string;
  precio: number;
  cantidadMinima: number;
  fechaInicio: string; 
  articulodescripcion: string;
}