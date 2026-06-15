import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { DashboardDTO } from '../../../core/models/dashboard.models';

@Injectable({
  providedIn: 'root'
})
export class DashboardService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/Data`; // Ajusta según tu controlador

  getDashboardData(year: number, month: number): Observable<DashboardDTO> {
    // El interceptor ya pondrá el token, no te preocupes por eso
    return this.http.get<DashboardDTO>(`${this.apiUrl}/GetDashboard?anio=${year}&mes=${month}`);
  }
}