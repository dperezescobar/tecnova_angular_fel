import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { AbonoEmpresaDto, PerfilEmpresaDto } from '../../../core/models/perfil.models';

@Injectable({ providedIn: 'root' })
export class PerfilService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/DATA`;

  getPerfilEmpresa(idEmpresa: number): Observable<PerfilEmpresaDto> {
    const params = new HttpParams().set('idEmpresa', idEmpresa.toString());
    return this.http.get<PerfilEmpresaDto>(`${this.apiUrl}/GetPerfilEmpresa`, { params });
  }

  getAbonosEmpresa(idEmpresa: number): Observable<AbonoEmpresaDto[]> {
    const params = new HttpParams().set('idEmpresa', idEmpresa.toString());
    return this.http.get<AbonoEmpresaDto[]>(`${this.apiUrl}/GetAbonosEmpresa`, { params });
  }
}
