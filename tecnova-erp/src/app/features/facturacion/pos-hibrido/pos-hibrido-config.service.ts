import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay, tap } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import {
  ConsolidacionResultDto,
  PosHibridoConfigDto,
  PosModoDocumento,
  PosRubroConfigDto,
  PosUsuarioRubroDto,
  ReciboPendienteDto
} from '../../../core/models/facturacion.models';

/**
 * Cliente del módulo POS Híbrido - Fase 2 (recibos consolidables). Todo opt-in por empresa; si
 * PosHibridoConfig.Activo es false (o no existe fila), pos-hibrido se comporta exactamente igual
 * que antes (siempre FACTURA_DIRECTA, sin restricciones de rubro por usuario).
 */
@Injectable({ providedIn: 'root' })
export class PosHibridoConfigService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/PosHibrido`;

  private config$: Observable<PosHibridoConfigDto> | null = null;
  private rubros$: Observable<PosRubroConfigDto[]> | null = null;

  /** Cacheado en memoria por sesión de componente; usar invalidarCache() tras guardar configuración. */
  getConfig(): Observable<PosHibridoConfigDto> {
    if (!this.config$) {
      this.config$ = this.http.get<PosHibridoConfigDto>(`${this.baseUrl}/Config`).pipe(
        catchError(() => of({ idEmpresa: 0, activo: false })),
        shareReplay(1)
      );
    }
    return this.config$;
  }

  getRubroConfig(): Observable<PosRubroConfigDto[]> {
    if (!this.rubros$) {
      this.rubros$ = this.http.get<PosRubroConfigDto[]>(`${this.baseUrl}/RubroConfig`).pipe(
        catchError(() => of([])),
        shareReplay(1)
      );
    }
    return this.rubros$;
  }

  invalidarCache(): void {
    this.config$ = null;
    this.rubros$ = null;
  }

  putConfig(dto: PosHibridoConfigDto): Observable<unknown> {
    return this.http.put(`${this.baseUrl}/Config`, dto).pipe(tap(() => this.invalidarCache()));
  }

  putRubroConfig(items: PosRubroConfigDto[]): Observable<unknown> {
    return this.http.put(`${this.baseUrl}/RubroConfig`, items).pipe(tap(() => this.invalidarCache()));
  }

  getUsuariosEmpresa(): Observable<{ usuario: string; nombre: string }[]> {
    return this.http.get<{ usuario: string; nombre: string }[]>(`${this.baseUrl}/UsuariosEmpresa`).pipe(catchError(() => of([])));
  }

  getUsuarioRubro(usuario?: string): Observable<PosUsuarioRubroDto[]> {
    const params = usuario ? { usuario } : undefined;
    return this.http.get<PosUsuarioRubroDto[]>(`${this.baseUrl}/UsuarioRubro`, { params }).pipe(catchError(() => of([])));
  }

  putUsuarioRubro(usuario: string, items: PosUsuarioRubroDto[]): Observable<unknown> {
    return this.http.put(`${this.baseUrl}/UsuarioRubro/${encodeURIComponent(usuario)}`, items);
  }

  /**
   * Modo de documento para un carrito dado sus rubros (GRUPO_INVENTARIO_1 de las líneas). Sin
   * PosHibridoConfig.Activo=1 siempre es FACTURA_DIRECTA (comportamiento actual, intacto). Un
   * rubro sin fila en PosRubroConfig se trata como FACTURA_DIRECTA (default seguro/fiscal).
   */
  resolverModo(config: PosHibridoConfigDto, rubrosConfig: PosRubroConfigDto[], gruposCarrito: string[]): PosModoDocumento {
    if (!config?.activo || !gruposCarrito.length) return 'FACTURA_DIRECTA';
    const mapa = new Map(rubrosConfig.filter((r) => r.activo).map((r) => [r.grupoInventario1, r.modoDocumento]));
    const modos = gruposCarrito.map((g) => mapa.get(g) ?? 'FACTURA_DIRECTA');
    return modos.some((m) => m === 'FACTURA_DIRECTA') ? 'FACTURA_DIRECTA' : 'RECIBO';
  }

  // ── Cierre de recibos (solo admin; el backend rechaza con 403 si no lo es) ──────────────────
  // El endpoint devuelve PascalCase (Sucursal/PuntoVenta/...); se normaliza aquí en vez de tipar
  // el http.get directo con nombres camelCase, que dejaba todos los campos en undefined.
  getPuntosVenta(): Observable<Array<{ sucursal: string; sucursalDescripcion: string; puntoVenta: string; puntoVentaDescripcion: string }>> {
    return this.http
      .get<Array<Record<string, unknown>>>(`${this.baseUrl}/PuntosVenta`)
      .pipe(
        map((rows) =>
          (rows ?? []).map((r) => ({
            sucursal: String(r['sucursal'] ?? r['Sucursal'] ?? '').trim(),
            sucursalDescripcion: String(r['sucursalDescripcion'] ?? r['SucursalDescripcion'] ?? '').trim(),
            puntoVenta: String(r['puntoVenta'] ?? r['PuntoVenta'] ?? '').trim(),
            puntoVentaDescripcion: String(r['puntoVentaDescripcion'] ?? r['PuntoVentaDescripcion'] ?? '').trim()
          }))
        ),
        catchError(() => of([]))
      );
  }

  getRecibosPendientes(fechaDesde?: string, fechaHasta?: string, sucursal?: string, puntoVenta?: string): Observable<ReciboPendienteDto[]> {
    const params: Record<string, string> = {};
    if (fechaDesde) params['fechaDesde'] = fechaDesde;
    if (fechaHasta) params['fechaHasta'] = fechaHasta;
    if (sucursal) params['sucursal'] = sucursal;
    if (puntoVenta) params['puntoVenta'] = puntoVenta;
    return this.http.get<ReciboPendienteDto[]>(`${this.baseUrl}/RecibosPendientes`, { params });
  }

  armarConsolidacion(idsFacturaOrigen: number[]): Observable<ConsolidacionResultDto> {
    return this.http.post<ConsolidacionResultDto>(`${this.baseUrl}/ArmarConsolidacion`, { idsFacturaOrigen });
  }

  quitarDeConsolidacion(idFacturaConsolidada: number, idFacturaOrigen: number): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/QuitarDeConsolidacion`, { idFacturaConsolidada, idFacturaOrigen });
  }

  cancelarConsolidacion(idFacturaConsolidada: number): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/CancelarConsolidacion`, { idFacturaConsolidada });
  }

  aplicarConsolidacion(idFacturaConsolidada: number): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/AplicarConsolidacion`, { idFacturaConsolidada });
  }
}
