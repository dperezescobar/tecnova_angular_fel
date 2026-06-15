import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs';
import { environment } from '../../../../environments/environment';

import {
  CatalogOptionDTO,
  ClienteDetalleDTO,
  ClienteListadoDTO,
  ClienteOperationResponse,
  TipoClienteDTO,
  ClienteUpdateDTO,
  CorrelativoResponse
} from '../../../core/models/clientes.models';

@Injectable({ providedIn: 'root' })
export class ClientesService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/Clientes`;
  private proveedoresApiUrl = `${environment.apiUrl}/Proveedores`;

  private pick(raw: Record<string, unknown>, ...keys: string[]): unknown {
    for (const key of keys) {
      const value = raw[key];
      if (value !== undefined && value !== null) {
        return value;
      }
    }

    return undefined;
  }

  private toNumber(value: unknown, fallback: number = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private toBoolean(value: unknown): boolean {
    const text = String(value ?? '').trim().toLowerCase();
    return text === '1' || text === 'true' || text === 's' || text === 'si' || text === 'y' || text === 'yes';
  }

  private asValue(value: unknown): string | number {
    if (typeof value === 'number') {
      return value;
    }

    const text = String(value ?? '').trim();
    const parsed = Number(text);
    if (text && Number.isFinite(parsed) && !text.startsWith('0')) {
      return parsed;
    }

    return text;
  }

  private normalizeCliente(raw: Record<string, unknown>): ClienteListadoDTO {
    return {
      CLIENTE: String(raw['CLIENTE'] ?? raw['cliente'] ?? ''),
      NOMBRE: String(raw['NOMBRE'] ?? raw['nombre'] ?? ''),
      ALIAS: String(raw['ALIAS'] ?? raw['alias'] ?? ''),
      NIT: String(raw['NIT'] ?? raw['nit'] ?? ''),
      REGISTRO_COMERCIO: String(
        raw['REGISTRO_COMERCIO'] ?? raw['registro_comercio'] ?? raw['registrO_COMERCIO'] ?? ''
      ),
      Pais: String(raw['Pais'] ?? raw['pais'] ?? ''),
      MUNICIPIO: String(raw['MUNICIPIO'] ?? raw['municipio'] ?? ''),
      DEPTO: String(raw['DEPTO'] ?? raw['depto'] ?? ''),
      ACTIVO: String(raw['ACTIVO'] ?? raw['activo'] ?? ''),
      CLIENTE_PREFERENCIAL: this.toBoolean(raw['CLIENTE_PREFERENCIAL'] ?? raw['clientE_PREFERENCIAL']),
      CANTIDAD_MINIMA: this.toNumber(raw['CANTIDAD_MINIMA'] ?? raw['cantidaD_MINIMA'], 0)
    };
  }

  getListadoClientes(filtro: string = ''): Observable<ClienteListadoDTO[]> {
    const params = new HttpParams().set('filtro', filtro);
    return this.http
      .get<Array<Record<string, unknown>>>(`${this.apiUrl}/GetListadoClientes`, { params })
      .pipe(map((list) => (list ?? []).map((item) => this.normalizeCliente(item))));
  }

  getCorrelativo(origen: 'Local' | 'Exterior'): Observable<CorrelativoResponse> {
    const params = new HttpParams().set('origen', origen);
    return this.http.get<CorrelativoResponse>(`${this.apiUrl}/GetCorrelativo`, { params });
  }

  getCorrelativoByTipoCliente(tipoCliente: string): Observable<CorrelativoResponse> {
    const params = new HttpParams().set('origen', tipoCliente);
    return this.http.get<CorrelativoResponse>(`${this.apiUrl}/GetCorrelativo`, { params });
  }

  getClienteByCodigo(codigo: string): Observable<ClienteDetalleDTO> {
    return this.http
      .get<Record<string, unknown>>(`${this.apiUrl}/GetClienteByCodigo/${encodeURIComponent(codigo)}`)
      .pipe(
        map((raw) => ({
          CLIENTE: String(this.pick(raw, 'CLIENTE', 'cliente') ?? ''),
          NOMBRE: String(this.pick(raw, 'NOMBRE', 'nombre', 'NOMBRE_RAZON_SOCIAL') ?? ''),
          ALIAS: String(this.pick(raw, 'ALIAS', 'alias', 'NOMBRE_COMERCIAL') ?? ''),
          ORIGEN: String(this.pick(raw, 'ORIGEN', 'origen') ?? 'L').toUpperCase() === 'E' ? 'E' : 'L',
          DIRECCION: String(this.pick(raw, 'DIRECCION', 'direccion') ?? ''),
          IDPAIS: this.toNumber(this.pick(raw, 'IDPAIS', 'idpais')),
          IDDEPARTAMENTO: String(
            this.pick(raw, 'IDDEPARTAMENTO', 'iddepartamento', 'COD_DEPARTAMENTO', 'cod_departamento', 'DEPARTAMENTO') ?? ''
          ),
          IDMUNICIPIO: String(
            this.pick(raw, 'IDMUNICIPIO', 'idmunicipio', 'COD_MUNICIPIO', 'cod_municipio', 'MUNICIPIO') ?? ''
          ),
          TELEFONO: String(this.pick(raw, 'TELEFONO', 'telefono') ?? ''),
          NIT: String(this.pick(raw, 'NIT', 'nit') ?? ''),
          REGISTRO_COMERCIO: String(
            this.pick(raw, 'REGISTRO_COMERCIO', 'registro_comercio', 'registrO_COMERCIO') ?? ''
          ),
          CORREO_ELECTRONICO: String(this.pick(raw, 'CORREO_ELECTRONICO', 'EMAIL', 'email') ?? ''),
          CONDICION_PAGO: String(this.pick(raw, 'CONDICION_PAGO', 'condicion_pago') ?? ''),
          TIPO_CLIENTE: String(this.pick(raw, 'TIPO_CLIENTE', 'tipo_cliente') ?? ''),
          ACTIVO: this.toBoolean(this.pick(raw, 'ACTIVO', 'activo')),
          idGiro: String(this.pick(raw, 'idGiro', 'IDGIRO') ?? ''),
          TipoPersona: this.toNumber(this.pick(raw, 'TipoPersona', 'TIPOPERSONA'), 1),
          OBSERVACION_CLIE: String(this.pick(raw, 'OBSERVACION_CLIE', 'OBSERVACION', 'observacion_clie') ?? ''),
          CLIENTE_PREFERENCIAL: this.toBoolean(this.pick(raw, 'CLIENTE_PREFERENCIAL', 'cliente_preferencial')),
        CANTIDAD_MINIMA: this.toNumber(this.pick(raw, 'CANTIDAD_MINIMA', 'cantidad_minima'), 0)
        }))
      );
  }

  getTipoClientes(): Observable<TipoClienteDTO[]> {
    return this.http
      .get<Array<Record<string, unknown>>>(`${this.apiUrl}/GetTipoClientes`)
      .pipe(
        map((rows) =>
          (rows ?? []).map((row) => ({
            TIPO_CLIENTE: String(this.pick(row, 'TIPO_CLIENTE', 'tipo_cliente') ?? ''),
            DESCRIPCION: String(this.pick(row, 'DESCRIPCION', 'descripcion') ?? '')
          }))
        )
      );
  }

  getPaises(): Observable<CatalogOptionDTO[]> {
    return this.http.get<Array<Record<string, unknown>>>(`${this.proveedoresApiUrl}/GetPaises`).pipe(
      map((rows) =>
        (rows ?? []).map((row) => ({
          value: String(this.pick(row, 'IDPAIS', 'IdPais', 'idpais', 'CODIGO', 'codigo', 'PaisCode') ?? ''),
          label: String(this.pick(row, 'PAIS', 'Pais', 'pais', 'DESCRIPCION', 'descripcion', 'NOMBRE', 'nombre') ?? '')
        }))
      )
    );
  }

  getDepartamentos(idpais: string): Observable<CatalogOptionDTO[]> {
    const params = new HttpParams().set('idpais', String(idpais));
    return this.http.get<Array<Record<string, unknown>>>(`${this.proveedoresApiUrl}/GetDepartamentos`, { params }).pipe(
      map((rows) =>
        (rows ?? []).map((row) => ({
          value: String(
            this.pick(
              row,
              'IDDEPARTAMENTO',
              'idDepartamento',
              'COD_DEPARTAMENTO',
              'cod_departamento',
              'DEPARTAMENTO',
              'departamento',
              'CODIGO',
              'codigo'
            ) ?? ''
          ),
          label: String(
            this.pick(row, 'NOMBRE_DEPARTAMENTO', 'NOMBRE', 'nombre', 'DESCRIPCION', 'Descripcion', 'DEPARTAMENTO') ?? ''
          )
        }))
      )
    );
  }

  getMunicipios(idDepto: number | string, idPais: string): Observable<CatalogOptionDTO[]> {
    const params = new HttpParams().set('idDepto', String(idDepto)).set('idPais', String(idPais));
    return this.http.get<Array<Record<string, unknown>>>(`${this.proveedoresApiUrl}/GetMunicipios`, { params }).pipe(
      map((rows) =>
        (rows ?? []).map((row) => ({
          value: String(
            this.pick(
              row,
              'IDMUNICIPIO',
              'idMunicipio',
              'COD_MUNICIPIO',
              'cod_municipio',
              'MUNICIPIO',
              'municipio',
              'CODIGO',
              'codigo'
            ) ?? ''
          ),
          label: String(this.pick(row, 'NOMBRE_MUNICIPIO', 'NOMBRE', 'nombre', 'DESCRIPCION', 'Descripcion', 'MUNICIPIO') ?? '')
        }))
      )
    );
  }

  getGiros(): Observable<CatalogOptionDTO[]> {
    return this.http.get<Array<Record<string, unknown>>>(`${this.proveedoresApiUrl}/GetGiros`).pipe(
      map((rows) =>
        (rows ?? []).map((row) => ({
          value: this.toNumber(this.pick(row, 'idGiro', 'IDGIRO', 'id', 'value')),
          label: String(this.pick(row, 'Giro', 'GIRO', 'Descripcion', 'DESCRIPCION', 'label') ?? '')
        }))
      )
    );
  }

  getCondicionesPago(): Observable<CatalogOptionDTO[]> {
    return this.http
      .get<Array<Record<string, unknown>>>(`${this.proveedoresApiUrl}/GetCondicionesPago`)
      .pipe(
        map((rows) =>
          (rows ?? []).map((row) => ({
            value: String(this.pick(row, 'CONDICION_PAGO', 'condicion_pago', 'CODIGO', 'Codigo', 'value') ?? ''),
            label: String(this.pick(row, 'DESCRIPCION', 'descripcion', 'CONDICION_PAGO', 'label') ?? '')
          }))
        )
      );
  }

  updateCliente(payload: ClienteUpdateDTO): Observable<ClienteOperationResponse> {
    return this.http.post<ClienteOperationResponse>(`${this.apiUrl}/UpdateCliente`, payload);
  }

  deleteCliente(cliente: string): Observable<ClienteOperationResponse> {
    return this.http.delete<ClienteOperationResponse>(`${this.apiUrl}/DeleteCliente/${encodeURIComponent(cliente)}`);
  }
}
