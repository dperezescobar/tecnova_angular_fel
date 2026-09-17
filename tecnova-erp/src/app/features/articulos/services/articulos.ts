import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  ArticuloBodegaDeleteDto,
  ArticuloBodegaUpdateDto,
  ArticuloDetalleDto,
  ArticuloDescuentoUpdateDto,
  ArticuloDto,
  ArticuloImpuestoDeleteDto,
  ArticuloImpuestoUpdateDto,
  ArticuloImagenUploadDto,
  ArticuloUpdateDto,
  BodegaCatalogoDto,
  GrupoInventarioCatalogoDto,
  GrupoInventarioCompletoDto,
  GrupoInventarioConsultaDto,
  GrupoInventarioDeleteDto,
  GrupoInventarioUpdateDto,
  ImpuestoCatalogoDto,
  PuntoVentaGrupoItemDto,
  TipoArticuloCatalogoDto,
  UnidadMedidaCatalogoDto
} from '../../../core/models/articulos.models';

@Injectable({ providedIn: 'root' })
export class ArticulosService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/Articulo`;

  private pick(raw: Record<string, unknown>, ...keys: string[]): unknown {
    for (const key of keys) {
      const value = raw[key];
      if (value !== undefined && value !== null) {
        return value;
      }
    }

    return undefined;
  }

  private toNumber(value: unknown, fallback: number = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private toText(value: unknown): string {
    return String(value ?? '').trim();
  }

  private toBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    const text = String(value ?? '').trim().toLowerCase();
    return text === 'true' || text === '1';
  }

  private pickArray(raw: Record<string, unknown>, ...keys: string[]): Array<Record<string, unknown>> {
    const value = this.pick(raw, ...keys);
    return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
  }

  private normalizeArticulo(raw: Record<string, unknown>): ArticuloDto {
    return {
      Articulo: this.toText(this.pick(raw, 'Articulo', 'articulo', 'ARTICULO')),
      Descripcion: this.toText(this.pick(raw, 'Descripcion', 'descripcion', 'DESCRIPCION')),
      TipoArticulo: this.toText(this.pick(raw, 'TipoArticulo', 'tipoArticulo', 'TIPO_ARTICULO')),
      GravadoComo: this.toText(this.pick(raw, 'GravadoComo', 'gravadoComo', 'GRAVADO_COMO')),
      UltimoPrecio: this.toNumber(this.pick(raw, 'UltimoPrecio', 'ultimoPrecio', 'ULTIMO_PRECIO')),
      MaterialId: this.toNumber(this.pick(raw, 'MaterialId', 'materialId', 'MATERIALID')),
      UsuarioCreacion: this.toText(this.pick(raw, 'UsuarioCreacion', 'usuarioCreacion', 'Usuario_creacion')),
      Activo: this.toBoolean(this.pick(raw, 'Activo', 'activo', 'ACTIVO'))
    };
  }

  getArticulos(): Observable<ArticuloDto[]> {
    return this.http
      .get<Array<Record<string, unknown>>>(`${this.apiUrl}/GetArticulos`)
      .pipe(map((rows) => (rows ?? []).map((row) => this.normalizeArticulo(row))));
  }

  getArticulo(articulo: string): Observable<ArticuloDetalleDto> {
    return this.http
      .get<Record<string, unknown>>(`${this.apiUrl}/GetArticulo/${encodeURIComponent(articulo)}`)
      .pipe(
        map((raw) => {
          const base = this.normalizeArticulo(raw);

          return {
            ...base,
            GrupoInventario1: this.toText(this.pick(raw, 'GrupoInventario1', 'GRUPO_INVENTARIO_1')),
            Des1: this.toText(this.pick(raw, 'Des1', 'des1', 'DES1')),
            GrupoInventario2: this.toText(this.pick(raw, 'GrupoInventario2', 'grupoInventario2', 'GRUPO_INVENTARIO_2')),
            Des2: this.toText(this.pick(raw, 'Des2', 'des2', 'DES2')),
            GrupoInventario3: this.toText(this.pick(raw, 'GrupoInventario3', 'grupoInventario3', 'GRUPO_INVENTARIO_3')),
            Des3: this.toText(this.pick(raw, 'Des3', 'des3', 'DES3')),
            GrupoInventario4: this.toText(this.pick(raw, 'GrupoInventario4', 'grupoInventario4', 'GRUPO_INVENTARIO_4')),
            Des4: this.toText(this.pick(raw, 'Des4', 'des4', 'DES4')),
            GrupoInventario5: this.toText(this.pick(raw, 'GrupoInventario5', 'grupoInventario5', 'GRUPO_INVENTARIO_5')),
            Des5: this.toText(this.pick(raw, 'Des5', 'des5', 'DES5')),
            GrupoInventario6: this.toText(this.pick(raw, 'GrupoInventario6', 'grupoInventario6', 'GRUPO_INVENTARIO_6')),
            Des6: this.toText(this.pick(raw, 'Des6', 'des6', 'DES6')),
            Activo: this.toText(this.pick(raw, 'Activo', 'activo', 'ACTIVO')),
            MetodoCosteoInterno: this.toText(this.pick(raw, 'MetodoCosteoInterno', 'metodoCosteoInterno', 'METODO_COSTEO_INTERNO')),
            ArticuloCuenta: this.toText(this.pick(raw, 'ArticuloCuenta', 'articuloCuenta', 'ARTICULO_CUENTA')),
            DescripcionArticuloCuenta: this.toText(
              this.pick(raw, 'DescripcionArticuloCuenta', 'descripcionArticuloCuenta', 'DESCRIPCION_ARTICULO_CUENTA')
            ),
            UnidadMedida: this.toText(this.pick(raw, 'UnidadMedida', 'unidadMedida', 'UNIDAD_MEDIDA')),
            DescripcionUM: this.toText(this.pick(raw, 'DescripcionUM', 'descripcionUM', 'DESCRIPCION_UM')),
            Peso: this.toNumber(this.pick(raw, 'Peso', 'peso', 'PESO')),
            Ancho: this.toNumber(this.pick(raw, 'Ancho', 'ancho', 'ANCHO')),
            Rendimiento: this.toNumber(this.pick(raw, 'Rendimiento', 'rendimiento', 'RENDIMIENTO')),
            ArticuloCtaCrudo: this.toText(this.pick(raw, 'ArticuloCtaCrudo', 'articuloCtaCrudo', 'ARTICULO_CTA_CRUDO')),
            DescripcionCdo: this.toText(this.pick(raw, 'DescripcionCdo', 'descripcionCdo', 'DESCRIPCIONCDO')),
            ArticuloCtaTerminado: this.toText(this.pick(raw, 'ArticuloCtaTerminado', 'articuloCtaTerminado', 'ARTICULO_CTA_TERMINADO')),
            DescripcionTerminado: this.toText(this.pick(raw, 'DescripcionTerminado', 'descripcionTerminado', 'DESCRIPCIONTERMINADO')),
            Acabado: this.toText(this.pick(raw, 'Acabado', 'acabado', 'ACABADO')),
            Color: this.toText(this.pick(raw, 'Color', 'color', 'COLOR')),
            Bodegas: this.pickArray(raw, 'Bodegas', 'bodegas', 'BODEGAS').map((b) => ({
                  Bodega: this.toText(this.pick(b, 'Bodega', 'bodega', 'BODEGA')),
                  Descripcion: this.toText(this.pick(b, 'Descripcion', 'descripcion', 'DESCRIPCION')),
                  ExistenciaMinima: this.toNumber(this.pick(b, 'ExistenciaMinima', 'existenciaMinima', 'EXISTENCIA_MINIMA')),
                  ExistenciaMaxima: this.toNumber(this.pick(b, 'ExistenciaMaxima', 'existenciaMaxima', 'EXISTENCIA_MAXIMA'))
                })),
            Impuestos: this.pickArray(raw, 'Impuestos', 'impuestos', 'IMPUESTOS').map((i) => ({
                  Impuesto: this.toText(this.pick(i, 'Impuesto', 'impuesto', 'IMPUESTO')),
                  Descripcion: this.toText(this.pick(i, 'Descripcion', 'descripcion', 'DESCRIPCION'))
                })),
            Descuentos: this.pickArray(raw, 'Descuentos', 'descuentos', 'DESCUENTOS').map((d) => ({
                  IdArticuloDescuento: this.toNumber(this.pick(d, 'IdArticuloDescuento', 'idArticuloDescuento')),
                  ArticuloDescripcion: this.toText(this.pick(d, 'ArticuloDescripcion', 'articuloDescripcion')),
                  TipoDescuento: this.toText(this.pick(d, 'TipoDescuento', 'tipoDescuento')),
                  Descuento: this.toText(this.pick(d, 'Descuento', 'descuento')),
                  Vigencia: this.toText(this.pick(d, 'Vigencia', 'vigencia')),
                  Activo: this.toNumber(this.pick(d, 'Activo', 'activo')),
                  Articulo: this.toText(this.pick(d, 'Articulo', 'articulo', 'ARTICULO')),
                  FechaIngreso: this.toText(this.pick(d, 'FechaIngreso', 'fechaIngreso'))
                }))
          };
        })
      );
  }

  getCodigoAutogenerado(tipoArticulo: string, grupoInventario1: string, grupoInventario2: string): Observable<string> {
    const tipo = tipoArticulo.trim();
    const grupo = grupoInventario1.trim();
    const subGrupo = grupoInventario2.trim();

    const params = new HttpParams()
      .set('tipoArticulo', tipo)
      .set('Grupo', grupo)
      .set('SubGrupo', subGrupo);

    return this.http
      .get(`${this.apiUrl}/GetCodigoAutogenerado`, { params, responseType: 'text' })
      .pipe(map((codigo) => this.toText(codigo)));
  }

  getCatalogoImpuestos(): Observable<ImpuestoCatalogoDto[]> {
    return this.http
      .get<Array<Record<string, unknown>>>(`${this.apiUrl}/GetCatalogoImpuestos`)
      .pipe(
        map((rows) =>
          (rows ?? []).map((r) => ({
            Impuesto: this.toText(this.pick(r, 'Impuesto', 'impuesto', 'IMPUESTO')),
            Nombre: this.toText(this.pick(r, 'Nombre', 'nombre', 'NOMBRE'))
          }))
        )
      );
  }

  getCatalogoBodegas(): Observable<BodegaCatalogoDto[]> {
    return this.http
      .get<Array<Record<string, unknown>>>(`${this.apiUrl}/GetCatalogoBodegas`)
      .pipe(
        map((rows) =>
          (rows ?? []).map((r) => ({
            Bodega: this.toText(this.pick(r, 'Bodega', 'bodega', 'BODEGA')),
            Descripcion: this.toText(this.pick(r, 'Descripcion', 'descripcion', 'DESCRIPCION'))
          }))
        )
      );
  }

  getCatalogoTipoArticulo(): Observable<TipoArticuloCatalogoDto[]> {
    return this.http
      .get<Array<Record<string, unknown>>>(`${this.apiUrl}/GetCatalogoTipoArticulo`)
      .pipe(
        map((rows) =>
          (rows ?? []).map((r) => ({
            TipoArticulo: this.toText(this.pick(r, 'TipoArticulo', 'tipoArticulo', 'TIPO_ARTICULO')),
            Descripcion: this.toText(this.pick(r, 'Descripcion', 'descripcion', 'DESCRIPCION'))
          }))
        )
      );
  }

  getCatalogoUnidadMedida(): Observable<UnidadMedidaCatalogoDto[]> {
    return this.http
      .get<Array<Record<string, unknown>>>(`${this.apiUrl}/GetCatalogoUnidadMedida`)
      .pipe(
        map((rows) =>
          (rows ?? []).map((r) => ({
            UnidadMedida: this.toText(this.pick(r, 'UnidadMedida', 'unidadMedida', 'UNIDAD_MEDIDA')),
            Descripcion: this.toText(this.pick(r, 'Descripcion', 'descripcion', 'DESCRIPCION'))
          }))
        )
      );
  }

  getCatalogoGrupoInventario(filtro: string = ''): Observable<GrupoInventarioCatalogoDto[]> {
    const safeFilter = filtro && filtro.trim().length > 0 ? filtro.trim() : '%';
    const params = new HttpParams().set('filtro', safeFilter);
    return this.http
      .get<Array<Record<string, unknown>>>(`${this.apiUrl}/GetCatalogoGrupoInventario`, { params })
      .pipe(
        map((rows) =>
          (rows ?? []).map((r) => ({
            GrupoInventario: this.toText(this.pick(r, 'GrupoInventario', 'grupoInventario', 'GRUPO_INVENTARIO')),
            Descripcion: this.toText(this.pick(r, 'Descripcion', 'descripcion', 'DESCRIPCION'))
          }))
        )
      );
  }

  getGruposInventarioPorNivel(nivel: number): Observable<GrupoInventarioConsultaDto[]> {
    const params = new HttpParams().set('nivel', String(nivel));
    return this.http
      .get<Array<Record<string, unknown>>>(`${this.apiUrl}/GetGruposInventarioPorNivel`, { params })
      .pipe(
        map((rows) =>
          (rows ?? []).map((r) => ({
            GrupoInventario: this.toText(this.pick(r, 'GrupoInventario', 'grupoInventario', 'GRUPO_INVENTARIO')),
            Descripcion: this.toText(this.pick(r, 'Descripcion', 'descripcion', 'DESCRIPCION'))
          }))
        )
      );
  }

  getPuntosVentaPorGrupo(grupo: string = ''): Observable<PuntoVentaGrupoItemDto[]> {
    const params = new HttpParams().set('grupo', (grupo || '').trim());
    return this.http
      .get<Array<Record<string, unknown>>>(`${this.apiUrl}/GetPuntosVentaPorGrupo`, { params })
      .pipe(
        map((rows) =>
          (rows ?? []).map((r) => ({
            Sucursal: this.toText(this.pick(r, 'Sucursal', 'sucursal')),
            SucursalNombre: this.toText(this.pick(r, 'SucursalNombre', 'sucursalNombre')),
            PuntoVenta: this.toText(this.pick(r, 'PuntoVenta', 'puntoVenta')),
            PuntoVentaNombre: this.toText(this.pick(r, 'PuntoVentaNombre', 'puntoVentaNombre')),
            Asignado: this.toBoolean(this.pick(r, 'Asignado', 'asignado'))
          }))
        )
      );
  }

  getGruposInventarioCompleto(): Observable<GrupoInventarioCompletoDto[]> {
    return this.http
      .get<Array<Record<string, unknown>>>(`${this.apiUrl}/GetGruposInventarioCompleto`)
      .pipe(
        map((rows) =>
          (rows ?? []).map((r) => ({
            GrupoInventario: this.toText(this.pick(r, 'GrupoInventario', 'grupoInventario', 'GRUPO_INVENTARIO')),
            Descripcion: this.toText(this.pick(r, 'Descripcion', 'descripcion', 'DESCRIPCION')),
            Nivel: this.toNumber(this.pick(r, 'Nivel', 'nivel', 'NIVEL'), 1),
            TotalArticulos: this.toNumber(this.pick(r, 'TotalArticulos', 'totalArticulos'), 0),
            TotalPvAsignados: this.toNumber(this.pick(r, 'TotalPvAsignados', 'totalPvAsignados'), 0),
            TotalPvDisponibles: this.toNumber(this.pick(r, 'TotalPvDisponibles', 'totalPvDisponibles'), 0)
          }))
        )
      );
  }

  updateGrupoInventario(payload: GrupoInventarioUpdateDto): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/UpdateGrupoInventario`, payload);
  }

  deleteGrupoInventario(payload: GrupoInventarioDeleteDto): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/DeleteGrupoInventario`, payload);
  }

  updateArticulo(payload: ArticuloUpdateDto): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/UpdateArticulo`, payload);
  }

  updateArticuloBodega(payload: ArticuloBodegaUpdateDto): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/UpdateArticuloBodega`, payload);
  }

  updateArticuloImpuesto(payload: ArticuloImpuestoUpdateDto): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/UpdateArticuloImpuesto`, payload);
  }

  updateArticuloDescuento(payload: ArticuloDescuentoUpdateDto): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/UpdateArticuloDescuento`, payload);
  }

  deleteArticuloBodega(payload: ArticuloBodegaDeleteDto): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/DeleteArticuloBodega`, payload);
  }

  deleteArticuloImpuesto(payload: ArticuloImpuestoDeleteDto): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/DeleteArticuloImpuesto`, payload);
  }

  deleteArticulo(articulo: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/DeleteArticulo`, { Valor: articulo });
  }

  /**
   * Sube una fotografía de producto comprimida al servidor usando multipart/form-data.
   * El backend debe exponer: POST /api/Articulo/UploadImagen
   */
  uploadArticuloImagen(
    articulo: string,
    blob: Blob,
    meta: Pick<ArticuloImagenUploadDto, 'NombreArchivo' | 'ContentType' | 'Usuario'>
  ): Observable<{ message: string }> {
    const formData = new FormData();
    formData.append('Articulo', articulo);
    formData.append('NombreArchivo', meta.NombreArchivo);
    formData.append('ContentType', meta.ContentType);
    formData.append('Tamano', String(blob.size));
    formData.append('Usuario', meta.Usuario);
    formData.append('file', blob, meta.NombreArchivo);
    return this.http.post<{ message: string }>(`${this.apiUrl}/UploadImagen`, formData);
  }

  /**
   * Obtiene la fotografía de un artículo como Blob.
   * Endpoint sugerido: GET /api/Articulo/GetImagen/{articulo}
   */
  getArticuloImagen(articulo: string, forceRefresh: boolean = false): Observable<Blob> {
    const params = forceRefresh
      ? new HttpParams().set('_ts', Date.now().toString())
      : undefined;

    return this.http.get(
      `${this.apiUrl}/GetImagen/${encodeURIComponent(articulo)}`,
      { responseType: 'blob', params }
    );
  }
}
