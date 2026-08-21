import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface PermisoRol {
  rol: string;
  nombre: string;
  descripcion?: string;
  activo: boolean;
  fechaCreacion?: string;
}

@Injectable({ providedIn: 'root' })
export class RolesAdminService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/Roles`;

  getRoles(): Observable<PermisoRol[]> {
    return this.http.get<PermisoRol[]>(this.apiUrl);
  }

  guardarRol(rol: PermisoRol): Observable<void> {
    return this.http.post<void>(this.apiUrl, rol);
  }

  getRolesUsuario(usuario: string): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/usuario/${encodeURIComponent(usuario)}`);
  }

  asignarRolesUsuario(usuario: string, roles: string[], idEmpresa: number = 0): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/usuario/${encodeURIComponent(usuario)}`, { roles, idEmpresa });
  }
}
