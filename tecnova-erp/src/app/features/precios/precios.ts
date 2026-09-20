import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ArticuloDoblePrecioGuardarRequest, ArticuloPrecioGuardarRequest, ArticuloPrecioVigenteResponse } from '../../core/models/articulo-precio.models';

@Injectable({ providedIn: 'root' })
export class ArticuloPrecioService {
  private http = inject(HttpClient);
  private api = environment.apiUrl + '/Articulo'; 

  obtenerPreciosVigentes(articulo?: string): Observable<ArticuloPrecioVigenteResponse[]> {
    let params = new HttpParams();
    if (articulo) params = params.set('articulo', articulo);
    return this.http.get<ArticuloPrecioVigenteResponse[]>(`${this.api}/ObtenerPreciosVigentes`, { params });
  }

  guardarPrecio(request: ArticuloPrecioGuardarRequest): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.api}/ArticuloPrecioGuardarRequest`, request);
  }

  guardarDoblePrecio(request: ArticuloDoblePrecioGuardarRequest): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.api}/GuardarDoblePrecio`, request);
  }
}