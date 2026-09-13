import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Cancha {
  idCancha: number;
  nombre: string;
  tipo: string;
  precioDia: number;
  precioNoche: number;
  horaInicioNoche: string;
  estado: string;
  activo: boolean;
}

export interface ReservacionCancha {
  idReservacion: number;
  idCancha: number;
  nombreCancha: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  clienteNombre: string;
  clienteTelefono?: string;
  estado: string;
  montoTotal: number;
  montoAnticipo: number;
  saldoPendiente: number;
  idFacturaAnticipo?: number;
  idFacturaLiquidacion?: number;
  notas?: string;
  usuarioCrea: string;
  fechaCreacion: string;
}

export interface CrearReservacionReq {
  idCancha: number;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  clienteNombre: string;
  clienteTelefono?: string;
  montoTotal: number;
  montoAnticipo: number;
  notas?: string;
}

export interface Balon {
  idBalon: number;
  codigo: string;
  marca: string;
  numero: string;
  estadoFisico: string;
  estadoPrestamo: string;
  activo: boolean;
}

export interface PrestamoBalon {
  idPrestamo: number;
  idBalon: number;
  codigoBalon: string;
  marcaBalon: string;
  numeroBalon: string;
  idReservacion?: number;
  responsable: string;
  documentoIdentidad?: string;
  fechaHoraSalida: string;
  fechaHoraEntrega?: string;
  estadoPrestamo: string;
  observacionesSalida?: string;
  observacionesEntrega?: string;
  usuarioEntrega: string;
  usuarioRecibe?: string;
}

export interface RegistrarPrestamoReq {
  idBalon: number;
  idReservacion?: number;
  responsable: string;
  documentoIdentidad?: string;
  observacionesSalida?: string;
}

export interface DevolucionBalonReq {
  idPrestamo: number;
  estadoFisicoRetorno: string;
  observacionesEntrega?: string;
}

export interface CobroReservacionReq {
  idReservacion: number;
  montoPago: number;
  formaPago: string;
  referenciaPago?: string;
}

@Injectable({
  providedIn: 'root'
})
export class EuroSoccerService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiUrl;

  getCanchas(): Observable<Cancha[]> {
    return this.http.get<Cancha[]>(this.baseUrl + '/DeportesCanchas/GetCanchas');
  }

  getReservaciones(fecha: string): Observable<ReservacionCancha[]> {
    return this.http.get<ReservacionCancha[]>(this.baseUrl + '/DeportesCanchas/GetReservaciones?fecha=' + encodeURIComponent(fecha));
  }

  crearReservacion(req: CrearReservacionReq): Observable<{ idReservacion: number; montoTotal: number; message: string }> {
    return this.http.post<{ idReservacion: number; montoTotal: number; message: string }>(this.baseUrl + '/DeportesCanchas/CrearReservacion', req);
  }

  cobrarReservacion(req: CobroReservacionReq): Observable<{ montoAnticipo: number; saldoPendiente: number; message: string }> {
    return this.http.post<{ montoAnticipo: number; saldoPendiente: number; message: string }>(this.baseUrl + '/DeportesCanchas/CobrarReservacion', req);
  }

  cancelarReservacion(id: number): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(this.baseUrl + '/DeportesCanchas/CancelarReservacion/' + id, {});
  }

  getBalones(): Observable<Balon[]> {
    return this.http.get<Balon[]>(this.baseUrl + '/DeportesBalones/GetBalones');
  }

  getPrestamosActivos(): Observable<PrestamoBalon[]> {
    return this.http.get<PrestamoBalon[]>(this.baseUrl + '/DeportesBalones/GetPrestamosActivos');
  }

  registrarPrestamo(req: RegistrarPrestamoReq): Observable<{ idPrestamo: number; message: string }> {
    return this.http.post<{ idPrestamo: number; message: string }>(this.baseUrl + '/DeportesBalones/RegistrarPrestamo', req);
  }

  devolverBalon(req: DevolucionBalonReq): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(this.baseUrl + '/DeportesBalones/DevolverBalon', req);
  }

  // ==========================================
  // CRUD ADMINISTRACIÓN: CANCHAS
  // ==========================================
  guardarCancha(cancha: Partial<Cancha>): Observable<{ idCancha: number; message: string }> {
    return this.http.post<{ idCancha: number; message: string }>(this.baseUrl + '/DeportesCanchas/GuardarCancha', cancha);
  }

  eliminarCancha(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(this.baseUrl + '/DeportesCanchas/EliminarCancha/' + id);
  }

  // ==========================================
  // CRUD ADMINISTRACIÓN: BALONES
  // ==========================================
  guardarBalon(balon: Partial<Balon>): Observable<{ idBalon: number; message: string }> {
    return this.http.post<{ idBalon: number; message: string }>(this.baseUrl + '/DeportesBalones/GuardarBalon', balon);
  }

  eliminarBalon(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(this.baseUrl + '/DeportesBalones/EliminarBalon/' + id);
  }

  // ==========================================
  // INVENTARIO EUROSOCCER (BODEGA BODEURO)
  // ==========================================
  getExistenciasEuro(): Observable<ArticuloInventario[]> {
    return this.http.post<ArticuloInventario[]>(this.baseUrl + '/Inventario/ReporteExistencias', {
      bodega: 'BODEURO'
    });
  }

  getCatalogoGeneral(): Observable<any[]> {
    return this.http.get<any[]>(this.baseUrl + '/Articulo/GetArticulos');
  }

  guardarMovimiento(req: MovimientoInventarioReq): Observable<{ message: string; documentoInv: number }> {
    return this.http.post<{ message: string; documentoInv: number }>(this.baseUrl + '/Inventario/GuardarMovimiento', req);
  }

  guardarDetalleMovimiento(req: DetalleMovimientoReq): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(this.baseUrl + '/Inventario/UpdateDetalleMovimiento', req);
  }

  aplicarMovimiento(documentoInv: number): Observable<any> {
    return this.http.post<any>(this.baseUrl + '/Inventario/AplicarMovimiento', documentoInv);
  }
}

export interface ArticuloInventario {
  articulo: string;
  descripcion: string;
  unidadMedida: string;
  bodega: string;
  saldo: number;
  precioUnitario: number;
  precioMayoreo: number;
}

export interface MovimientoInventarioReq {
  documentoInv: number;
  correlativoInv: string;
  fecha: string;
  comentario: string;
  bodega: string;
  bodegaDestino: string;
  tipoTransInv: string;
  tipoMov: string;
  contabilizar: number;
  tipoMtto: string;
  sucursal: string;
  documentoSujetoDevolucion: boolean;
  existenciaFecDoc: number;
  usuario: string;
}

export interface DetalleMovimientoReq {
  documentoInv: number;
  articulo: string;
  cantidad: number;
  precioUnitario: number;
  usuario: string;
}