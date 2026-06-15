import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ArticuloPorBodegaDto } from '../../../core/models/facturacion.models';

@Injectable({ providedIn: 'root' })
export class ArticulosLazyService {
  private http = inject(HttpClient);
  private facturaApiUrl = `${environment.apiUrl}/Factura`;

  /**
   * Consulta artículos por bodega y filtro, paginado.
   * @param bodega Bodega
   * @param filtro Texto de búsqueda
   * @param skip Desde qué registro
   * @param take Cuántos registros
   */
  getArticulosPorBodegaLazy(
    bodega: string = 'BOD01',
    filtro: string = '',
    skip: number = 0,
    take: number = 20
  ): Observable<ArticuloPorBodegaDto[]> {
    const params = new HttpParams()
      .set('bodega', bodega)
      .set('filtro', filtro)
      .set('skip', skip)
      .set('take', take);
    return this.http
      .get<Array<Record<string, unknown>>>(`${this.facturaApiUrl}/GetArticulosPorBodegaLazy`, { params })
      .pipe(map((rows) => (rows ?? []).map((item) => this.mapArticuloPorBodega(item))));
  }

  private mapArticuloPorBodega(raw: Record<string, unknown>): ArticuloPorBodegaDto {
   const normalized: Record<string, any> = {};
  Object.keys(raw).forEach(key => {
    normalized[key.toUpperCase()] = raw[key];
  });
    return {
      ARTICULO: String(normalized['ARTICULO'] ?? ''),
      DESCRIPCION: String(normalized['DESCRIPCION'] ?? ''),
      TIPO_ARTICULO: String(normalized['TIPO_ARTICULO'] ?? ''),
      ULTIMO_PRECIO: Number(normalized['ULTIMO_PRECIO'] ?? 0),
      TIENE_IMAGEN: Boolean(normalized['TIENE_IMAGEN']),
      PRECIO_MAYOREO: Number(normalized['PRECIO_MAYOREO'] ?? 0),
      cantidadmayoreo: Number(normalized['cantidadmayoreo'] ?? 0)
    };
  }
}
