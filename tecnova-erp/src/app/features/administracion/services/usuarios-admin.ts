import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import {
  ReiniciarPasswordResponse,
  UsuarioDetalle,
  UsuarioEditarRequest,
  UsuarioListado,
  UsuarioNuevoRequest
} from '../../../core/models/usuarios-admin.models';

@Injectable({ providedIn: 'root' })
export class UsuariosAdminService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/Usuarios`;

  private pick(raw: Record<string, unknown>, ...keys: string[]): unknown {
    for (const key of keys) {
      const value = raw[key];
      if (value !== undefined && value !== null) {
        return value;
      }
    }
    return undefined;
  }

  private toBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    return ['1', 'true', 'si', 'sí'].includes(String(value ?? '').trim().toLowerCase());
  }

  private normalizeListado(raw: Record<string, unknown>): UsuarioListado {
    return {
      usuario: String(this.pick(raw, 'usuario', 'Usuario') ?? ''),
      nombre: String(this.pick(raw, 'nombre', 'Nombre') ?? ''),
      tipo: String(this.pick(raw, 'tipo', 'Tipo') ?? ''),
      correoElectronico: String(this.pick(raw, 'correoElectronico', 'CorreoElectronico') ?? ''),
      activo: this.toBoolean(this.pick(raw, 'activo', 'Activo')),
      bloqueado: this.toBoolean(this.pick(raw, 'bloqueado', 'Bloqueado')),
      createdBy: String(this.pick(raw, 'createdBy', 'CreatedBy') ?? '') || undefined,
      roles: (this.pick(raw, 'roles', 'Roles') as string[]) ?? [],
      sistemas: ((this.pick(raw, 'sistemas', 'Sistemas') as number[]) ?? []).map(Number),
      sistemasNombres: (this.pick(raw, 'sistemasNombres', 'SistemasNombres') as string[]) ?? []
    };
  }

  private normalizeDetalle(raw: Record<string, unknown>): UsuarioDetalle {
    return {
      usuario: String(this.pick(raw, 'usuario', 'Usuario') ?? ''),
      nombre: String(this.pick(raw, 'nombre', 'Nombre') ?? ''),
      tipo: String(this.pick(raw, 'tipo', 'Tipo') ?? ''),
      correoElectronico: String(this.pick(raw, 'correoElectronico', 'CorreoElectronico') ?? ''),
      activo: this.toBoolean(this.pick(raw, 'activo', 'Activo')),
      bloqueado: this.toBoolean(this.pick(raw, 'bloqueado', 'Bloqueado')),
      politicaNuevoPassword: this.toBoolean(this.pick(raw, 'politicaNuevoPassword', 'PoliticaNuevoPassword')),
      dui: String(this.pick(raw, 'dui', 'DUI') ?? '') || undefined,
      sistemas: ((this.pick(raw, 'sistemas', 'Sistemas') as number[]) ?? []).map(Number)
    };
  }

  private normalizeReinicio(raw: Record<string, unknown>): ReiniciarPasswordResponse {
    return {
      usuario: String(this.pick(raw, 'usuario', 'Usuario') ?? ''),
      nuevaPassword: String(this.pick(raw, 'nuevaPassword', 'NuevaPassword') ?? '')
    };
  }

  getSistemas(): Observable<{ idSistema: number; sistema: string }[]> {
    return this.http.get<{ idSistema: number; sistema: string; IdSistema?: number; Sistema?: string }[]>(`${this.apiUrl}/Sistemas`).pipe(
      map((rows) =>
        (rows ?? []).map((r) => ({
          idSistema: Number(r.idSistema ?? r.IdSistema ?? 0),
          sistema: String(r.sistema ?? r.Sistema ?? '')
        }))
      )
    );
  }

  getListado(idEmpresa: number, idSistema?: number): Observable<UsuarioListado[]> {
    const params: Record<string, any> = { idEmpresa };
    if (idSistema && idSistema > 0) {
      params['idSistema'] = idSistema;
    }
    return this.http
      .get<Record<string, unknown>[]>(`${this.apiUrl}/Listado`, { params })
      .pipe(map((rows) => (rows ?? []).map((r) => this.normalizeListado(r))));
  }

  getDetalle(usuario: string): Observable<UsuarioDetalle> {
    return this.http
      .get<Record<string, unknown>>(`${this.apiUrl}/${encodeURIComponent(usuario)}`)
      .pipe(map((r) => this.normalizeDetalle(r)));
  }

  crear(request: UsuarioNuevoRequest): Observable<void> {
    return this.http.post<void>(this.apiUrl, request);
  }

  editar(usuario: string, request: UsuarioEditarRequest): Observable<void> {
    return this.http.put<void>(`${this.apiUrl}/${encodeURIComponent(usuario)}`, request);
  }

  desactivar(usuario: string): Observable<void> {
    return this.http.put<void>(`${this.apiUrl}/${encodeURIComponent(usuario)}/desactivar`, {});
  }

  bloquear(usuario: string): Observable<void> {
    return this.http.put<void>(`${this.apiUrl}/${encodeURIComponent(usuario)}/bloquear`, {});
  }

  desbloquear(usuario: string): Observable<void> {
    return this.http.put<void>(`${this.apiUrl}/${encodeURIComponent(usuario)}/desbloquear`, {});
  }

  cambiarPassword(usuario: string, nuevaPassword: string): Observable<void> {
    return this.http.put<void>(`${this.apiUrl}/${encodeURIComponent(usuario)}/cambiar-password`, { nuevaPassword });
  }

  reiniciarPassword(usuario: string): Observable<ReiniciarPasswordResponse> {
    return this.http
      .put<Record<string, unknown>>(`${this.apiUrl}/${encodeURIComponent(usuario)}/reiniciar-password`, {})
      .pipe(map((r) => this.normalizeReinicio(r)));
  }
}
