import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface CuadroVentasDto {
  sucursal: string;
  numero: string;
  fecha: string;
  cliente: string;
  categoria: string;
  articulo: string;
  descripcionArticulo: string;
  costoPromedio: number;
  subTotal: number;
  costoTotal: number;
  utilidad: number;
  unidadFacturada: string;
  precioUnitario: number;
  tipoFactura: string;
  tipoCliente: string;
  pais: string;
  condicionPago: string;
  anio: number;
  mes: number;
  dias: number;
  nombreMes: string;
  iva: number;
  retencion: number;
  estadoFactura: string;
  vendedor: string;
  totalFactura: number;
  descuentoAdicional: number;
  descuento: number;
  usuarioCreacion: string;
}

@Injectable({ providedIn: 'root' })
export class CuadroVentasService {
  private http = inject(HttpClient);
  private api = environment.apiUrl + '/Reportes';

  getCuadroVentas(fechaDesde: string, fechaHasta: string): Observable<CuadroVentasDto[]> {
    return this.http.get<CuadroVentasDto[]>(`${this.api}/CuadroVentas`, {
      params: { fechaDesde, fechaHasta },
    });
  }
}
