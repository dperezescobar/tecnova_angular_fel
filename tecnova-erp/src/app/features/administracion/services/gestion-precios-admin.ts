import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  ArticuloPrecioItem,
  CrossSellingItem,
  PromocionItem,
  TipoPrecioItem,
  UpsertCrossSellingRequest,
  UpsertPrecioRequest,
  UpsertPromocionRequest
} from '../../../core/models/gestion-precios-admin.models';

@Injectable({
  providedIn: 'root'
})
export class GestionPreciosAdminService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/GestionPrecios`;

  getTiposPrecio(): Observable<TipoPrecioItem[]> {
    return this.http.get<TipoPrecioItem[]>(`${this.baseUrl}/tipos-precio`);
  }

  getPrecios(articulo?: string): Observable<ArticuloPrecioItem[]> {
    const params: Record<string, string> = {};
    if (articulo) params['articulo'] = articulo;
    return this.http.get<ArticuloPrecioItem[]>(`${this.baseUrl}/precios`, { params });
  }

  guardarPrecio(payload: UpsertPrecioRequest): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.baseUrl}/precios`, payload);
  }

  getPromociones(): Observable<PromocionItem[]> {
    return this.http.get<PromocionItem[]>(`${this.baseUrl}/promociones`);
  }

  guardarPromocion(payload: UpsertPromocionRequest): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.baseUrl}/promociones`, payload);
  }

  eliminarPromocion(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.baseUrl}/promociones/${id}`);
  }

  getCrossSelling(): Observable<CrossSellingItem[]> {
    return this.http.get<CrossSellingItem[]>(`${this.baseUrl}/cross-selling`);
  }

  guardarCrossSelling(payload: UpsertCrossSellingRequest): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.baseUrl}/cross-selling`, payload);
  }

  eliminarCrossSelling(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.baseUrl}/cross-selling/${id}`);
  }
}
