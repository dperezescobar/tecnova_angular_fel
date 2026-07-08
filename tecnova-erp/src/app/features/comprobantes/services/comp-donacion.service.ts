import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  CDListadoDto,
  CDEncabezadoDto,
  CDDetalleDto,
  CDSaveDto,
  CDDetalleSaveDto,
  CDDetalleDeleteDto,
  CDAplicarDto,
  CDAnularDto,
  CDFormaPagoDto,
  TipoDonacionDto,
  FormaPagoDocDto,
} from '../../../core/models/comprobantes.models';
import { PerfilClienteDto } from '../../../core/models/facturacion.models';

@Injectable({ providedIn: 'root' })
export class CompDonacionService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/ComprobanteDonacion`;
  private facturaApiUrl = `${environment.apiUrl}/Factura`;

  getListado(desde: string, hasta: string, filtro = ''): Observable<CDListadoDto[]> {
    const params = new HttpParams().set('desde', desde).set('hasta', hasta).set('filtro', filtro);
    return this.http.get<CDListadoDto[]>(`${this.apiUrl}/GetListadoCD`, { params });
  }

  getCDByPrefijoFactura(prefijo: string, factura: string): Observable<CDEncabezadoDto> {
    const params = new HttpParams().set('prefijo', prefijo).set('factura', factura);
    return this.http.get<CDEncabezadoDto>(`${this.apiUrl}/GetCDByPrefijoFactura`, { params });
  }

  getCDById(idFactura: number): Observable<CDEncabezadoDto> {
    const params = new HttpParams().set('idFactura', idFactura);
    return this.http.get<CDEncabezadoDto>(`${this.apiUrl}/GetCDById`, { params });
  }

  saveCD(dto: CDSaveDto): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/SaveCD`, dto);
  }

  getDetalle(prefijo: string, factura: string): Observable<CDDetalleDto[]> {
    const params = new HttpParams().set('prefijo', prefijo).set('factura', factura);
    return this.http.get<CDDetalleDto[]>(`${this.apiUrl}/GetDetalleCD`, { params });
  }

  addDetalle(dto: CDDetalleSaveDto): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/AddDetalleCD`, dto);
  }

  deleteDetalle(dto: CDDetalleDeleteDto): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/DeleteDetalleCD`, { body: dto });
  }

  aplicar(dto: CDAplicarDto): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/AplicarCD`, dto);
  }

  anular(dto: CDAnularDto): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/AnularCD`, dto);
  }

  deleteCD(idFactura: number): Observable<{ message: string }> {
    const params = new HttpParams().set('idFactura', idFactura);
    return this.http.delete<{ message: string }>(`${this.apiUrl}/DeleteCD`, { params });
  }

  getTipoDonacion(): Observable<TipoDonacionDto[]> {
    return this.http.get<TipoDonacionDto[]>(`${this.apiUrl}/GetTipoDonacion`);
  }

  getFormasPago(idFactura: number): Observable<FormaPagoDocDto[]> {
    const params = new HttpParams().set('idFactura', idFactura);
    return this.http.get<FormaPagoDocDto[]>(`${this.apiUrl}/GetFormasPagoCD`, { params });
  }

  updateFormaPago(dto: CDFormaPagoDto): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/UpdateFormaPagoCD`, dto);
  }

  getPerfilCliente(cliente: string): Observable<PerfilClienteDto> {
    const params = new HttpParams().set('cliente', cliente);
    return this.http.get<PerfilClienteDto>(`${this.facturaApiUrl}/GetPerfilCliente`, { params });
  }

  searchClientes(filtro: string): Observable<Record<string, unknown>[]> {
    const params = new HttpParams().set('filtro', filtro).set('TipoConsulta', 'GridView');
    return this.http.get<Record<string, unknown>[]>(`${this.facturaApiUrl}/GetClientes`, { params });
  }

  getArticulos(bodega = 'BOD01'): Observable<Record<string, unknown>[]> {
    const params = new HttpParams().set('bodega', bodega);
    return this.http.get<Record<string, unknown>[]>(`${this.facturaApiUrl}/GetArticulosPorBodega`, { params });
  }

  getUnidadesMedida(articulo: string): Observable<Record<string, unknown>[]> {
    const params = new HttpParams().set('articulo', articulo);
    return this.http.get<Record<string, unknown>[]>(`${this.facturaApiUrl}/GetUnidadesMedidaArticulo`, { params });
  }

  getFormasPagoCatalogo(): Observable<Record<string, unknown>[]> {
    return this.http.get<Record<string, unknown>[]>(`${this.facturaApiUrl}/GetFormasPago`);
  }
}
