import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ArticuloPrecioGuardarRequest } from '../../core/models/articulo-precio.models';

@Injectable({ providedIn: 'root' })
export class ArticuloPrecioService {
  private http = inject(HttpClient);
  private api = environment.apiUrl + '/Articulo';

  guardarPrecio(request: ArticuloPrecioGuardarRequest): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.api}/ArticuloPrecioGuardarRequest`, request);
  }
}