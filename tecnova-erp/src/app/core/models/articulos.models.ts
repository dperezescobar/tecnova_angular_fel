export interface ArticuloDto {
  Articulo: string;
  Descripcion: string;
  TipoArticulo: string;
  GravadoComo: string;
  UltimoPrecio: number;
  MaterialId: number;
  UsuarioCreacion: string;
  Activo: boolean;
}

export interface ArticuloBodegaDto {
  Bodega: string;
  Descripcion: string;
  ExistenciaMinima: number;
  ExistenciaMaxima: number;
}

export interface ArticuloImpuestoDto {
  Impuesto: string;
  Descripcion: string;
}

export interface ArticuloDescuentoDto {
  IdArticuloDescuento: number;
  ArticuloDescripcion: string;
  TipoDescuento?: string;
  Descuento: string;
  Vigencia: string;
  Activo: number;
  Articulo: string;
  FechaIngreso: string;
}

export interface ArticuloDetalleDto extends Omit<ArticuloDto, 'Activo'> {
  GrupoInventario1: string;
  Des1: string;
  GrupoInventario2: string;
  Des2: string;
  GrupoInventario3: string;
  Des3: string;
  GrupoInventario4: string;
  Des4: string;
  GrupoInventario5: string;
  Des5: string;
  GrupoInventario6: string;
  Des6: string;
  Activo: string;
  MetodoCosteoInterno: string;
  ArticuloCuenta: string;
  DescripcionArticuloCuenta: string;
  UnidadMedida: string;
  DescripcionUM: string;
  Peso: number;
  Ancho: number;
  Rendimiento: number;
  ArticuloCtaCrudo: string;
  DescripcionCdo: string;
  ArticuloCtaTerminado: string;
  DescripcionTerminado: string;
  Acabado: string;
  Color: string;
  Bodegas: ArticuloBodegaDto[];
  Impuestos: ArticuloImpuestoDto[];
  Descuentos: ArticuloDescuentoDto[];
}

export interface ImpuestoCatalogoDto {
  Impuesto: string;
  Nombre: string;
}

export interface BodegaCatalogoDto {
  Bodega: string;
  Descripcion: string;
}

export interface TipoArticuloCatalogoDto {
  TipoArticulo: string;
  Descripcion: string;
}

export interface UnidadMedidaCatalogoDto {
  UnidadMedida: string;
  Descripcion: string;
}

export interface GrupoInventarioCatalogoDto {
  GrupoInventario: string;
  Descripcion: string;
}

export interface GrupoInventarioConsultaDto {
  GrupoInventario: string;
  Descripcion: string;
}

export interface PuntoVentaGrupoItemDto {
  Sucursal: string;
  SucursalNombre: string;
  PuntoVenta: string;
  PuntoVentaNombre: string;
  Asignado: boolean;
}

export interface PuntoVentaGrupoAsignacionDto {
  Sucursal: string;
  PuntoVenta: string;
  Asignado: boolean;
}

export interface GrupoInventarioUpdateDto {
  GpoInventario: string;
  Descripcion: string;
  Nivel: number;
  Usuario: string;
  Modificar: number;
  PuntosVenta?: PuntoVentaGrupoAsignacionDto[];
}

export interface GrupoInventarioDeleteDto {
  GpoInventario: string;
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface ArticuloUpdateDto {
  Articulo: string;
  Descripcion: string;
  Gpo1: string;
  Gpo2: string;
  Gpo3: string;
  Gpo4: string;
  Gpo5: string;
  TipoArticulo: string;
  ExistenciaMinima: number;
  ExistenciaMaxima: number;
  Activo: boolean;
  MetodoCosteoInterno: string;
  ArticuloCuenta: string;
  UnidadMedida: string;
  Peso: number;
  Ancho: number;
  Rendimiento: number;
  UltimoPrecio: number;
  Usuario: string;
  Gravado: string;
  Modificar: number;
  ArticuloCtaCrudo: string;
  Acabado: string;
  Color: string;
  MaterialId: number;
}

export interface ArticuloBodegaUpdateDto {
  Articulo: string;
  Bodega: string;
  ExistenciaMinima: number;
  ExistenciaMaxima: number;
  Usuario: string;
}

export interface ArticuloImpuestoUpdateDto {
  Articulo: string;
  Impuesto: string;
  Usuario: string;
}

export interface ArticuloDescuentoUpdateDto {
  IdArticuloDescuento: number;
  Articulo: string;
  TipoDescuento: string;
  ValorDescuento: number;
  Usuario: string;
  Activo: number;
  TipoMtto: 'A' | 'B' | 'C';
}

export interface ArticuloBodegaDeleteDto {
  Articulo: string;
  Bodega: string;
}

export interface ArticuloImpuestoDeleteDto {
  Articulo: string;
  Impuesto: string;
}

export interface ArticuloImagenUploadDto {
  /** Código del artículo */
  Articulo: string;
  /** Nombre de archivo normalizado (ej. "ABC001.jpg") */
  NombreArchivo: string;
  /** MIME type de la imagen resultante, siempre image/jpeg tras comprimir */
  ContentType: string;
  /** Tamaño en bytes del blob comprimido */
  Tamano: number;
  /** Usuario que sube la imagen */
  Usuario: string;
}