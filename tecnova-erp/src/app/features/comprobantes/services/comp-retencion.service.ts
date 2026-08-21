import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  CRListadoDto,
  CREncabezadoDto,
  CRDetalleDto,
  CRSaveDto,
  CRDetalleSaveDto,
  CRDetalleDeleteDto,
  PerfilProveedorDto,
  ProveedorBusquedaDto,
} from '../../../core/models/comprobantes.models';

export interface DteSelladoDto {
  response?: string;
  selloRecibido?: string;
  fechaGeneracion?: string;
}

@Injectable({ providedIn: 'root' })
export class CompRetencionService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/ComprobanteRetencion`;

  getListado(desde: string, hasta: string, filtro = ''): Observable<CRListadoDto[]> {
    const params = new HttpParams().set('desde', desde).set('hasta', hasta).set('filtro', filtro);
    return this.http.get<CRListadoDto[]>(`${this.apiUrl}/GetListadoCR`, { params });
  }

  getCRById(correl: number): Observable<CREncabezadoDto> {
    const params = new HttpParams().set('correl', correl);
    return this.http.get<CREncabezadoDto>(`${this.apiUrl}/GetCRById`, { params });
  }

  saveCR(dto: CRSaveDto): Observable<{ ID: number; message: string }> {
    return this.http.post<{ ID: number; message: string }>(`${this.apiUrl}/SaveCR`, dto);
  }

  getDetalle(correl: number, comprobante: string, proveedor: string, fecha: string): Observable<CRDetalleDto[]> {
    const params = new HttpParams()
      .set('correl', correl)
      .set('comprobante', comprobante)
      .set('proveedor', proveedor)
      .set('fecha', fecha);
    return this.http.get<CRDetalleDto[]>(`${this.apiUrl}/GetDetalleCR`, { params });
  }

  addDetalle(dto: CRDetalleSaveDto): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/AddDetalleCR`, dto);
  }

  deleteDetalle(dto: CRDetalleDeleteDto): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/DeleteDetalleCR`, { body: dto });
  }

  deleteCR(correl: number): Observable<{ message: string }> {
    const params = new HttpParams().set('correl', correl);
    return this.http.delete<{ message: string }>(`${this.apiUrl}/DeleteCR`, { params });
  }

  anularCR(correl: number): Observable<{ message: string }> {
    const params = new HttpParams().set('correl', correl);
    return this.http.post<{ message: string }>(`${this.apiUrl}/AnularCR`, null, { params });
  }

  getPerfilProveedor(proveedor: string): Observable<PerfilProveedorDto> {
    const params = new HttpParams().set('proveedor', proveedor);
    return this.http.get<PerfilProveedorDto>(`${this.apiUrl}/GetPerfilProveedor`, { params });
  }

  searchProveedores(filtro: string): Observable<ProveedorBusquedaDto[]> {
    const params = new HttpParams().set('filtro', filtro);
    return this.http.get<ProveedorBusquedaDto[]>(`${this.apiUrl}/SearchProveedores`, { params });
  }

  validarDteMH(
    urlApi: string,
    idEmpresa: number,
    fecha: string,
    codGeneracion: string,
    nitProveedor: string,
    tipoDoc: string,
    ambiente: string
  ): Observable<DteSelladoDto[]> {
    const params = new HttpParams()
      .set('idEmpresa', idEmpresa)
      .set('Fecha', fecha)
      .set('codGeneracion', codGeneracion)
      .set('nitProveedor', nitProveedor)
      .set('tipodoc', tipoDoc)
      .set('ambiente', ambiente);
    
    // Quitamos la barra final de urlApi si la tuviera, para evitar dobles barras
    const baseUrl = urlApi.replace(/\/$/, '');
    return this.http.get<DteSelladoDto[]>(`${baseUrl}/api/Dteemitidoes/GetValidarDteProveedor`, { params });
  }
}
