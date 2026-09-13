import { Injectable, inject } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface MovimientoInventarioGuardarDto {
  documentoInv: number;
  correlativoInv: string;
  fecha: string;
  comentario: string;
  bodega: string;
  bodegaDestino: string;
  tipoTransInv: string;
  tipoMov: string;
  usuario: string;
  contabilizar: number;
  tipoMtto: string;
  sucursal: string;
  documentoSujetoDevolucion: boolean;
  existenciaFecDoc: number;
}

export interface MovimientoInventarioDetalleGuardarDto {
  correlativo: number;
  articulo: string;
  calidad: number;
  tipoColor: string;
  cuentaContable: string;
  centroCosto: string;
  cantidad: number;
  costoUnitario: number;
  precioUnitario: number;
  usuario: string;
  idColor: number;
  idAcabado: string;
}
export interface DetalleMovimientoUpdateDto {
  documentoInv: number;
  articulo: string;
  cantidad: number; 
  precioUnitario: number;
  usuario: string;
}
@Injectable({ providedIn: 'root' })
export class IngresosInventarioService {
  private http = inject(HttpClient);
  private api = environment.apiUrl + '/Inventario';

  getMovimientos(desde: string, hasta: string) {
    return this.http.get<any[]>(`${this.api}/GetMovimientos?desde=${desde}&hasta=${hasta}`);
  }

  getBodegas() {
    return this.http.get<{ bodega: string; descripcion: string }[]>(`${this.api}/GetBodegas`);
  }

  getMovimientoDetalle(documentoInv: number) {
    return this.http.get<any[]>(`${this.api}/GetMovimientoDetalle?documentoInv=${documentoInv}`);
  }

  guardarMovimiento(dto: MovimientoInventarioGuardarDto) {
    return this.http.post<{ message: string; documentoInv: number }>(`${this.api}/GuardarMovimiento`, dto);
  }
 eliminarMovimiento(documentoInv: number) {
    return this.http.post<{ message: string; documentoInv: number }>(`${this.api}/EliminarMovimiento`, { documentoInv });
  }
  actualizarMovimientoDetalle(dto: MovimientoInventarioDetalleGuardarDto) {
    return this.http.post<{ message: string }>(`${this.api}/GuardarMovimientoDetalle`, dto);
  }
 guardarMovimientoDetalle(dto: DetalleMovimientoUpdateDto) {
    return this.http.post<{ message: string }>(`${this.api}/UpdateDetalleMovimiento`, dto);
  }
  aplicarMovimiento(documentoInv: number) {
    return this.http.post<{ message: string }>(`${this.api}/AplicarMovimiento`, documentoInv);
  }

  desaplicarMovimiento(documentoInv: number) {
    return this.http.post<{ message: string }>(`${this.api}/DesaplicarMovimiento`, documentoInv);
  }

  eliminarMovimientoDetalle(documentoInv: number, correlativo: number) {
    return this.http.post<{ message: string }>(`${this.api}/EliminarMovimientoDetalle`, { documentoInv, correlativo });
  }

  eliminarMovimientoInventario(documentoInv: number) {
    return this.http.post<{ message: string }>(`${this.api}/EliminarMovimientoInventario`, documentoInv);
  }
}
