export interface ArticuloPrecioGuardarRequest {
  articulo: string;
  tipoPrecioID: number;
  precio: number;
  cantidadMinima: number;
  usuario: string;
}

export interface ArticuloDoblePrecioGuardarRequest {
  articulo: string;
  precioUnidad: number;
  precioMayoreo?: number | null;
  cantidadMinimaMayoreo?: number | null;
  usuario: string;
}

export interface ArticuloPrecioVigenteResponse {
  articulo: string;
  tipoPrecio: string;
  precio: number;
  cantidadMinima: number;
  fechaInicio: string; 
  articulodescripcion: string;
  tieneImagen?: boolean;
  grupoInventario?: string;
}