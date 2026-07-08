import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface CompraGridviewDto {
  fecha: string;
  claseDoc: string;
  tipoDoc: string;
  numero: string;
  nitNrc: string;
  proveedor: string;
  comprasInternasExentas: number;
  internaExentasONoSujetas: number;
  importExentasONoSujetas: number;
  comprasInternasGravadas: number;
  internaGravadasBienes: number;
  importGravadasBienes: number;
  importGravadasServicios: number;
  creditoFiscal: number;
  totalCompras: number;
  dui: string;
  tipoOperacion: number;
  clasificacion: number;
  sector: number;
  codCostoGasto: number;
  numeroAnexo: number;
  correl: number;
  numeroResolucion: string;
}

export interface CompraCargarJsonResult {
  archivo: string;
  mensaje: string;
  exitoso: boolean;
}

export interface CompraUpdateCamposDto {
  correl: number;
  clasificacion: number;
  sector: number;
  codCostoGasto: number;
}

export interface ProveedorLookup {
  proveedor: string;
  nombre: string;
  alias?: string;
  registroComercio?: string;
  nit?: string;
}

export interface CompraManualForm {
  claseDocumento: number;
  tipoComprobante: string;
  numeroDocumento: string;
  fecha: string;
  fechaLibro: string;
  nrcProveedor: string;
  duiProveedor: string;
  gravadas: number;
  iva: number;
  total: number;
  clasificacion: number;
  sector: number;
  codCostoGasto: number;
}

@Injectable({ providedIn: 'root' })
export class ComprasService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/Compras`;

  getGridview(fechaInicio: string, fechaFin: string): Observable<CompraGridviewDto[]> {
    return this.http.get<CompraGridviewDto[]>(
      `${this.api}/Gridview?fechaInicio=${fechaInicio}&fechaFin=${fechaFin}`
    );
  }

  cargarJsons(archivos: { nombreArchivo: string; contenidoJson: string }[]): Observable<CompraCargarJsonResult[]> {
    return this.http.post<CompraCargarJsonResult[]>(`${this.api}/CargarJson`, archivos);
  }

  updateCampos(dto: CompraUpdateCamposDto): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(`${this.api}/UpdateCampos`, dto);
  }

  updateCamposBulk(dtos: CompraUpdateCamposDto[]): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(`${this.api}/UpdateCamposBulk`, dtos);
  }

  eliminar(correl: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.api}/${correl}`);
  }

  getProveedores(): Observable<ProveedorLookup[]> {
    return this.http.get<ProveedorLookup[]>(`${this.api}/Proveedores`);
  }

  registrarManual(dto: CompraManualForm): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.api}/Registro`, dto);
  }
}
