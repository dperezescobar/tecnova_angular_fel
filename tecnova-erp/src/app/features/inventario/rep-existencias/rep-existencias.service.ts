import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface BodegaDto {
  bodega: string;
  descripcion: string;
}

export interface ArticuloSimpleDto {
  articulo: string;
  descripcion: string;
}

export interface GrupoDto {
  grupoInventario: string;
  descripcion: string;
}

export interface ExistenciaRequest {
  fechaCorte: string;
  bodega: string | null;
  articulo: string | null;
  grupo: string | null;
}

export interface ExistenciaDto {
  articulo: string;
  descripcion: string;
  unidadMedida: string;
  bodega: string;
  saldo: number;
  precioUnitario: number;
  precioMayoreo: number;
}

@Injectable({ providedIn: 'root' })
export class RepExistenciasService {
  private http = inject(HttpClient);
  private api = environment.apiUrl + '/Inventario';
  private artApi = environment.apiUrl + '/Articulo';

  getBodegas(): Observable<BodegaDto[]> {
    return this.http.get<BodegaDto[]>(`${this.api}/GetBodegas`);
  }

  getArticulos(): Observable<ArticuloSimpleDto[]> {
    return this.http.get<ArticuloSimpleDto[]>(`${this.artApi}/GetArticulos`);
  }

  getGrupos(): Observable<GrupoDto[]> {
    return this.http.get<GrupoDto[]>(`${this.artApi}/GetGruposInventarioPorNivel`, { params: { nivel: 1 } });
  }

  generarReporte(request: ExistenciaRequest): Observable<ExistenciaDto[]> {
    return this.http.post<ExistenciaDto[]>(`${this.api}/ReporteExistencias`, request);
  }
}
