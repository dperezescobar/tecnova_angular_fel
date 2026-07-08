import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';

import {
  CatalogOptionDTO,
  CorrelativoResponse,
  ProveedorDetalleDTO,
  ProveedorListadoDTO,
  ProveedorOperationResponse,
  ProveedorUpdateDTO,
  RetencionDTO,
  TipoRetencionDTO,
} from '../../../core/models/proveedores.models';

@Injectable({ providedIn: 'root' })
export class ProveedoresService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/Proveedores`;

  private pick(raw: Record<string, unknown>, ...keys: string[]): unknown {
    for (const key of keys) {
      const value = raw[key];
      if (value !== undefined && value !== null) return value;
    }
    return undefined;
  }

  private toNumber(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private toBoolean(value: unknown): boolean {
    const text = String(value ?? '').trim().toLowerCase();
    return text === '1' || text === 'true' || text === 's' || text === 'si' || text === 'y' || text === 'yes';
  }

  private normalizeProveedor(raw: Record<string, unknown>): ProveedorListadoDTO {
    return {
      PROVEEDOR: String(raw['PROVEEDOR'] ?? raw['proveedor'] ?? ''),
      NOMBRE: String(raw['NOMBRE'] ?? raw['nombre'] ?? raw['NOMBRE_RAZON_SOCIAL'] ?? ''),
      ALIAS: String(raw['ALIAS'] ?? raw['alias'] ?? raw['NOMBRE_COMERCIAL'] ?? ''),
      NIT: String(raw['NIT'] ?? raw['nit'] ?? ''),
      ORIGEN: String(raw['ORIGEN'] ?? raw['origen'] ?? 'L'),
      ACTIVO: String(raw['ACTIVO'] ?? raw['activo'] ?? ''),
    };
  }

  getListadoProveedores(filtro = ''): Observable<ProveedorListadoDTO[]> {
    const params = new HttpParams().set('filtro', filtro);
    return this.http
      .get<Array<Record<string, unknown>>>(`${this.apiUrl}/GetListadoProveedores`, { params })
      .pipe(map((list) => (list ?? []).map((item) => this.normalizeProveedor(item))));
  }

  getProveedorByCodigo(codigo: string): Observable<ProveedorDetalleDTO> {
    return this.http
      .get<Record<string, unknown>>(`${this.apiUrl}/GetProveedorByCodigo/${encodeURIComponent(codigo)}`)
      .pipe(
        map((raw) => ({
          PROVEEDOR: String(this.pick(raw, 'PROVEEDOR', 'proveedor') ?? ''),
          NOMBRE: String(this.pick(raw, 'NOMBRE', 'nombre', 'NOMBRE_RAZON_SOCIAL') ?? ''),
          ALIAS: String(this.pick(raw, 'ALIAS', 'alias', 'NOMBRE_COMERCIAL') ?? ''),
          ORIGEN: (String(this.pick(raw, 'ORIGEN', 'origen') ?? 'L').toUpperCase() === 'E' ? 'E' : 'L') as 'L' | 'E',
          DIRECCION: String(this.pick(raw, 'DIRECCION', 'direccion') ?? ''),
          IDPAIS: this.toNumber(this.pick(raw, 'IDPAIS', 'idpais')),
          IDDEPARTAMENTO: String(this.pick(raw, 'IDDEPARTAMENTO', 'iddepartamento', 'DEPARTAMENTO') ?? ''),
          IDMUNICIPIO: String(this.pick(raw, 'IDMUNICIPIO', 'idmunicipio', 'MUNICIPIO') ?? ''),
          TELEFONO: String(this.pick(raw, 'TELEFONO', 'telefono') ?? ''),
          NIT: String(this.pick(raw, 'NIT', 'nit') ?? ''),
          NRC: String(this.pick(raw, 'NRC', 'nrc', 'REGISTRO_COMERCIO', 'registrO_COMERCIO') ?? ''),
          EMAIL: String(this.pick(raw, 'EMAIL', 'email', 'CORREO_ELECTRONICO') ?? ''),
          CONDICION_PAGO: String(this.pick(raw, 'CONDICION_PAGO', 'condicion_pago') ?? ''),
          ACTIVO: this.toBoolean(this.pick(raw, 'ACTIVO', 'activo')),
          IDGIRO: String(this.pick(raw, 'idGiro', 'IDGIRO', 'idgiro') ?? ''),
          DUI: String(this.pick(raw, 'DUI', 'dui') ?? ''),
          TIPOPERSONA: this.toNumber(this.pick(raw, 'TipoPersona', 'TIPOPERSONA', 'tipopersona'), 1),
          OBSERVACION: String(this.pick(raw, 'Observacion', 'OBSERVACION', 'observacion') ?? ''),
          ACTIVIDAD: String(this.pick(raw, 'ACTIVIDAD', 'actividad') ?? ''),
        }))
      );
  }

  getCorrelativo(origen: 'Local' | 'Exterior'): Observable<CorrelativoResponse> {
    const params = new HttpParams().set('origen', origen);
    return this.http.get<CorrelativoResponse>(`${this.apiUrl}/GetCorrelativo`, { params });
  }

  updateProveedor(payload: ProveedorUpdateDTO): Observable<ProveedorOperationResponse> {
    return this.http.post<ProveedorOperationResponse>(`${this.apiUrl}/UpdateProveedor`, payload);
  }

  deleteProveedor(proveedor: string): Observable<ProveedorOperationResponse> {
    return this.http.delete<ProveedorOperationResponse>(`${this.apiUrl}/DeleteProveedor/${encodeURIComponent(proveedor)}`);
  }

  getPaises(): Observable<CatalogOptionDTO[]> {
    return this.http.get<Array<Record<string, unknown>>>(`${this.apiUrl}/GetPaises`).pipe(
      map((rows) =>
        (rows ?? []).map((row) => ({
          value: String(this.pick(row, 'IDPAIS', 'idpais', 'CODIGO', 'codigo') ?? ''),
          label: String(this.pick(row, 'PAIS', 'Pais', 'pais', 'NOMBRE', 'nombre', 'DESCRIPCION') ?? ''),
        }))
      )
    );
  }

  getDepartamentos(idpais: string): Observable<CatalogOptionDTO[]> {
    const params = new HttpParams().set('idpais', String(idpais));
    return this.http.get<Array<Record<string, unknown>>>(`${this.apiUrl}/GetDepartamentos`, { params }).pipe(
      map((rows) =>
        (rows ?? []).map((row) => ({
          value: String(this.pick(row, 'IDDEPARTAMENTO', 'idDepartamento', 'COD_DEPARTAMENTO', 'CODIGO') ?? ''),
          label: String(this.pick(row, 'NOMBRE_DEPARTAMENTO', 'NOMBRE', 'nombre', 'DESCRIPCION', 'Descripcion') ?? ''),
        }))
      )
    );
  }

  getMunicipios(idDepto: string, idPais: string): Observable<CatalogOptionDTO[]> {
    const params = new HttpParams().set('idDepto', String(idDepto)).set('idPais', String(idPais));
    return this.http.get<Array<Record<string, unknown>>>(`${this.apiUrl}/GetMunicipios`, { params }).pipe(
      map((rows) =>
        (rows ?? []).map((row) => ({
          value: String(this.pick(row, 'IDMUNICIPIO', 'idMunicipio', 'COD_MUNICIPIO', 'CODIGO') ?? ''),
          label: String(this.pick(row, 'NOMBRE_MUNICIPIO', 'NOMBRE', 'nombre', 'DESCRIPCION', 'Descripcion') ?? ''),
        }))
      )
    );
  }

  getGiros(): Observable<CatalogOptionDTO[]> {
    return this.http.get<Array<Record<string, unknown>>>(`${this.apiUrl}/GetGiros`).pipe(
      map((rows) =>
        (rows ?? []).map((row) => ({
          value: this.toNumber(this.pick(row, 'idGiro', 'IDGIRO', 'id', 'value')),
          label: String(this.pick(row, 'Giro', 'GIRO', 'Descripcion', 'DESCRIPCION', 'label') ?? ''),
        }))
      )
    );
  }

  getCondicionesPago(): Observable<CatalogOptionDTO[]> {
    return this.http.get<Array<Record<string, unknown>>>(`${this.apiUrl}/GetCondicionesPago`).pipe(
      map((rows) =>
        (rows ?? []).map((row) => ({
          value: String(this.pick(row, 'CONDICION_PAGO', 'condicion_pago', 'CODIGO', 'Codigo') ?? ''),
          label: String(this.pick(row, 'DESCRIPCION', 'descripcion', 'CONDICION_PAGO') ?? ''),
        }))
      )
    );
  }

  getTipoRetenciones(): Observable<TipoRetencionDTO[]> {
    return this.http.get<Array<Record<string, unknown>>>(`${this.apiUrl}/GetTipoRetenciones`).pipe(
      map((rows) =>
        (rows ?? []).map((row) => ({
          RETENCION: String(this.pick(row, 'RETENCION', 'retencion') ?? ''),
          DESCRIPCION: String(this.pick(row, 'DESCRIPCION', 'descripcion') ?? ''),
        }))
      )
    );
  }

  getRetencionesProveedor(codigo: string): Observable<RetencionDTO[]> {
    return this.http
      .get<Array<Record<string, unknown>>>(`${this.apiUrl}/GetRetencionesProveedor/${encodeURIComponent(codigo)}`)
      .pipe(
        map((rows) =>
          (rows ?? []).map((row) => ({
            RETENCION: String(this.pick(row, 'RETENCION', 'retencion') ?? ''),
            DESCRIPCION: String(this.pick(row, 'DESCRIPCION', 'descripcion') ?? ''),
          }))
        )
      );
  }

  addRetencionProveedor(dto: { PROVEEDOR: string; RETENCION: string; USUARIO: string }): Observable<ProveedorOperationResponse> {
    return this.http.post<ProveedorOperationResponse>(`${this.apiUrl}/AddRetencionProveedor`, dto);
  }

  deleteRetencionProveedor(proveedor: string, retencion: string): Observable<ProveedorOperationResponse> {
    return this.http.delete<ProveedorOperationResponse>(
      `${this.apiUrl}/DeleteRetencionProveedor/${encodeURIComponent(proveedor)}/${encodeURIComponent(retencion)}`
    );
  }
}
