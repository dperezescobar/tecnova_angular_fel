import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface ArticuloSimpleDto {
  articulo: string;
  descripcion: string;
}

export interface MovimientoRequest {
  articulo: string;
  fechaDesde: string | null;
  fechaHasta: string | null;
  bodega: string | null;
}

export interface MovimientoArticuloDto {
  articulo: string;
  fechaDocumento: string;
  movimiento: string; // 'I' = Ingreso, 'S' = Salida
  referencia: string;
  bodega: string;
  cantidad: number;
  usuario: string;
  registradoEl: string;
}

@Injectable({ providedIn: 'root' })
export class RepMovimientosService {
  private http = inject(HttpClient);
  private api = environment.apiUrl + '/Inventario';
  private artApi = environment.apiUrl + '/Articulo';

  getArticulos(): Observable<ArticuloSimpleDto[]> {
    return this.http.get<ArticuloSimpleDto[]>(`${this.artApi}/GetArticulos`);
  }

  generarReporte(request: MovimientoRequest): Observable<MovimientoArticuloDto[]> {
    return this.http.post<MovimientoArticuloDto[]>(`${this.api}/ReporteMovimientosArticulo`, request);
  }
}
