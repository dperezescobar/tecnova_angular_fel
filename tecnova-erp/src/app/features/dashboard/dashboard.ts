import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DashboardService } from './services/dashboard';
import { DashboardDTO } from '../../core/models/dashboard.models';

// PrimeNG Modules
import { SelectModule } from 'primeng/select';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, SelectModule, CardModule, ButtonModule, ProgressSpinnerModule],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.scss']
})
export class Dashboard implements OnInit {
  private dashboardService = inject(DashboardService);

  dashboardData = signal<DashboardDTO | null>(null);
  isLoading = signal(true);

  // Filtros
  months = [
    { label: 'Enero', value: 1 }, { label: 'Febrero', value: 2 },
    { label: 'Marzo', value: 3 }, { label: 'Abril', value: 4 },
    { label: 'Mayo', value: 5 }, { label: 'Junio', value: 6 },
    { label: 'Julio', value: 7 }, { label: 'Agosto', value: 8 },
    { label: 'Septiembre', value: 9 }, { label: 'Octubre', value: 10 },
    { label: 'Noviembre', value: 11 }, { label: 'Diciembre', value: 12 }
  ];
  
  years: number[] = [];
  
  selectedMonth: number = new Date().getMonth() + 1;
  selectedYear: number = new Date().getFullYear();

  private toNumber(value: unknown): number {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
      const normalized = value.replace(/[^\d.-]/g, '');
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  private normalizeDashboardData(data: DashboardDTO): DashboardDTO {
    return {
      ...data,
      ingresosTotalesAnio: this.toNumber(data.ingresosTotalesAnio),
      facturasEmitidasMes: this.toNumber(data.facturasEmitidasMes),
      ventasMesActual: this.toNumber(data.ventasMesActual),
      historialVentas: (data.historialVentas ?? []).map((item) => ({
        ...item,
        valor: this.toNumber(item.valor)
      })),
      facturasPorTipo: (data.facturasPorTipo ?? []).map((item) => ({
        ...item,
        cantidad: this.toNumber(item.cantidad)
      })),
      topClientesAnio: (data.topClientesAnio ?? []).map((item) => ({
        ...item,
        valor: this.toNumber(item.valor)
      })),
      topProductosAnio: (data.topProductosAnio ?? []).map((item) => ({
        ...item,
        valor: this.toNumber(item.valor)
      })),
      topProductosMes: (data.topProductosMes ?? []).map((item) => ({
        ...item,
        porcentaje: this.toNumber(item.porcentaje)
      }))
    };
  }

  ngOnInit() {
    // Generar últimos 3 años
    const currentYear = new Date().getFullYear();
    this.years = [currentYear, currentYear - 1, currentYear - 2];
    
    this.loadData();
  }

  loadData() {
    this.isLoading.set(true);
    this.dashboardService.getDashboardData(this.selectedYear, this.selectedMonth)
      .subscribe({
        next: (data) => {
          this.dashboardData.set(this.normalizeDashboardData(data));
          this.isLoading.set(false);
        },
        error: (err) => {
          console.error(err);
          this.isLoading.set(false);
        }
      });
  }

  // Utilidad para tu gráfico manual (Cálculo de altura %)
  calculateBarHeight(valor: number): number {
    const data = this.dashboardData();
    if (!data || !data.historialVentas.length) return 0;
    
    // Encontrar el valor máximo para que sea el 100%
    const max = Math.max(...data.historialVentas.map(v => v.valor));
    const divisor = max > 0 ? max : 1;
    
    return (valor * 100) / divisor;
  }
}