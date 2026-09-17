import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import {
  BodegaCatalogo,
  CondicionPago,
  PuntoVentaListado,
  PuntoVentaUpsertRequest,
  Sucursal,
  SucursalUpsertRequest,
  Vendedor,
  VendedorPuntoVenta
} from '../../../core/models/sucursales-punto-venta.models';

@Injectable({ providedIn: 'root' })
export class SucursalesPuntoVentaService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/SucursalesPuntoVenta`;
  private inventarioApiUrl = `${environment.apiUrl}/Inventario`;

  private pick(raw: Record<string, unknown>, ...keys: string[]): unknown {
    for (const key of keys) {
      const value = raw[key];
      if (value !== undefined && value !== null) return value;
    }
    return undefined;
  }

  private normalizeSucursal(raw: Record<string, unknown>): Sucursal {
    return {
      sucursal: String(this.pick(raw, 'sucursal', 'Sucursal') ?? ''),
      descripcion: String(this.pick(raw, 'descripcion', 'Descripcion') ?? ''),
      direccion: String(this.pick(raw, 'direccion', 'Direccion') ?? ''),
      telefono: String(this.pick(raw, 'telefono', 'Telefono') ?? ''),
      responsable: String(this.pick(raw, 'responsable', 'Responsable') ?? ''),
      codigoMH: String(this.pick(raw, 'codigoMH', 'CodigoMH') ?? '')
    };
  }

  private normalizePuntoVenta(raw: Record<string, unknown>): PuntoVentaListado {
    return {
      puntoVenta: String(this.pick(raw, 'puntoVenta', 'PuntoVenta') ?? ''),
      sucursal: String(this.pick(raw, 'sucursal', 'Sucursal') ?? ''),
      descripcion: String(this.pick(raw, 'descripcion', 'Descripcion') ?? ''),
      sucursalDescripcion: String(this.pick(raw, 'sucursalDescripcion', 'SucursalDescripcion') ?? ''),
      codigoMH: String(this.pick(raw, 'codigoMH', 'CodigoMH') ?? ''),
      condicionPago: String(this.pick(raw, 'condicionPago', 'CondicionPago') ?? ''),
      bodegaAsignada: String(this.pick(raw, 'bodegaAsignada', 'BodegaAsignada') ?? '')
    };
  }

  private normalizeBodega(raw: Record<string, unknown>): BodegaCatalogo {
    return {
      bodega: String(this.pick(raw, 'bodega', 'Bodega') ?? ''),
      descripcion: String(this.pick(raw, 'descripcion', 'Descripcion') ?? '')
    };
  }

  private normalizeCondicionPago(raw: Record<string, unknown>): CondicionPago {
    return {
      condicionPago: String(this.pick(raw, 'condicionPago', 'CondicionPago') ?? ''),
      descripcion: String(this.pick(raw, 'descripcion', 'Descripcion') ?? ''),
      diasCredito: Number(this.pick(raw, 'diasCredito', 'DiasCredito') ?? 0)
    };
  }

  private normalizeVendedor(raw: Record<string, unknown>): Vendedor {
    return {
      vendedor: String(this.pick(raw, 'vendedor', 'Vendedor') ?? ''),
      nombre: String(this.pick(raw, 'nombre', 'Nombre') ?? '')
    };
  }

  // ===== Sucursales =====

  getSucursales(filtro: string = ''): Observable<Sucursal[]> {
    return this.http
      .get<Record<string, unknown>[]>(`${this.apiUrl}/Sucursales`, { params: { filtro } })
      .pipe(map((rows) => (rows ?? []).map((r) => this.normalizeSucursal(r))));
  }

  crearSucursal(request: SucursalUpsertRequest): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/Sucursales`, request);
  }

  editarSucursal(sucursal: string, request: SucursalUpsertRequest): Observable<void> {
    return this.http.put<void>(`${this.apiUrl}/Sucursales/${encodeURIComponent(sucursal)}`, request);
  }

  eliminarSucursal(sucursal: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/Sucursales/${encodeURIComponent(sucursal)}`);
  }

  // ===== Puntos de venta =====

  getPuntosVenta(filtro: string = ''): Observable<PuntoVentaListado[]> {
    return this.http
      .get<Record<string, unknown>[]>(`${this.apiUrl}/PuntosVenta`, { params: { filtro } })
      .pipe(map((rows) => (rows ?? []).map((r) => this.normalizePuntoVenta(r))));
  }

  getCondicionesPago(): Observable<CondicionPago[]> {
    return this.http
      .get<Record<string, unknown>[]>(`${this.apiUrl}/CondicionesPago`)
      .pipe(map((rows) => (rows ?? []).map((r) => this.normalizeCondicionPago(r))));
  }

  getVendedoresCatalogo(): Observable<Vendedor[]> {
    return this.http
      .get<Record<string, unknown>[]>(`${this.apiUrl}/Vendedores`)
      .pipe(map((rows) => (rows ?? []).map((r) => this.normalizeVendedor(r))));
  }

  crearPuntoVenta(request: PuntoVentaUpsertRequest): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/PuntosVenta`, request);
  }

  editarPuntoVenta(sucursal: string, puntoVenta: string, request: PuntoVentaUpsertRequest): Observable<void> {
    return this.http.put<void>(`${this.apiUrl}/PuntosVenta/${encodeURIComponent(sucursal)}/${encodeURIComponent(puntoVenta)}`, request);
  }

  eliminarPuntoVenta(sucursal: string, puntoVenta: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/PuntosVenta/${encodeURIComponent(sucursal)}/${encodeURIComponent(puntoVenta)}`);
  }

  actualizarBodegaPuntoVenta(sucursal: string, puntoVenta: string, bodega: string): Observable<void> {
    return this.http.put<void>(
      `${this.apiUrl}/PuntosVenta/${encodeURIComponent(sucursal)}/${encodeURIComponent(puntoVenta)}/bodega`,
      { bodega }
    );
  }

  getBodegasCatalogo(): Observable<BodegaCatalogo[]> {
    return this.http
      .get<Record<string, unknown>[]>(`${this.inventarioApiUrl}/GetBodegas`)
      .pipe(map((rows) => (rows ?? []).map((r) => this.normalizeBodega(r))));
  }

  // ===== Usuarios asignados =====

  getUsuariosPuntoVenta(sucursal: string, puntoVenta: string): Observable<string[]> {
    return this.http.get<string[]>(
      `${this.apiUrl}/PuntosVenta/${encodeURIComponent(sucursal)}/${encodeURIComponent(puntoVenta)}/usuarios`
    );
  }

  asignarUsuarioPuntoVenta(sucursal: string, puntoVenta: string, usuario: string): Observable<void> {
    return this.http.post<void>(
      `${this.apiUrl}/PuntosVenta/${encodeURIComponent(sucursal)}/${encodeURIComponent(puntoVenta)}/usuarios`,
      { usuario }
    );
  }

  quitarUsuarioPuntoVenta(sucursal: string, puntoVenta: string, usuario: string): Observable<void> {
    return this.http.delete<void>(
      `${this.apiUrl}/PuntosVenta/${encodeURIComponent(sucursal)}/${encodeURIComponent(puntoVenta)}/usuarios/${encodeURIComponent(usuario)}`
    );
  }

  // ===== Vendedores asignados =====

  getVendedoresPuntoVenta(sucursal: string, puntoVenta: string): Observable<VendedorPuntoVenta[]> {
    return this.http
      .get<Record<string, unknown>[]>(
        `${this.apiUrl}/PuntosVenta/${encodeURIComponent(sucursal)}/${encodeURIComponent(puntoVenta)}/vendedores`
      )
      .pipe(map((rows) => (rows ?? []).map((r) => this.normalizeVendedor(r))));
  }

  asignarVendedorPuntoVenta(sucursal: string, puntoVenta: string, vendedor: string): Observable<void> {
    return this.http.post<void>(
      `${this.apiUrl}/PuntosVenta/${encodeURIComponent(sucursal)}/${encodeURIComponent(puntoVenta)}/vendedores`,
      { vendedor }
    );
  }

  quitarVendedorPuntoVenta(sucursal: string, puntoVenta: string, vendedor: string): Observable<void> {
    return this.http.delete<void>(
      `${this.apiUrl}/PuntosVenta/${encodeURIComponent(sucursal)}/${encodeURIComponent(puntoVenta)}/vendedores/${encodeURIComponent(vendedor)}`
    );
  }
}
