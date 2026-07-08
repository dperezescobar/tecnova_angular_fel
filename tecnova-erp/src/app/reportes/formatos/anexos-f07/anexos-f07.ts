import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { AnexosF07Service, ANEXO_CONFIGS, ColumnDef } from './anexos-f07.service';

@Component({
  selector: 'app-anexos-f07',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ButtonModule, ProgressSpinnerModule, ToastModule],
  providers: [MessageService],
  templateUrl: './anexos-f07.html',
  styleUrl: './anexos-f07.scss'
})
export class AnexosF07Component {
  private service = inject(AnexosF07Service);
  private toast = inject(MessageService);

  readonly anexoConfigs = ANEXO_CONFIGS;

  private hoy = new Date();
  fechaInicio = `${this.hoy.getFullYear()}-${String(this.hoy.getMonth() + 1).padStart(2, '0')}-01`;
  fechaFin = this.hoy.toISOString().substring(0, 10);
  tipoSeleccionado = signal('COMPRAS');

  isLoading = signal(false);
  datos = signal<any[]>([]);
  consultado = signal(false);

  columnas = computed<ColumnDef[]>(() =>
    ANEXO_CONFIGS.find(c => c.tipo === this.tipoSeleccionado())?.columns ?? []
  );

  labelAnexo = computed(() =>
    ANEXO_CONFIGS.find(c => c.tipo === this.tipoSeleccionado())?.label ?? ''
  );

  totalFilas = computed(() => this.datos().length);

  hayDatos = computed(() => this.datos().length > 0);

  consultar() {
    if (!this.fechaInicio || !this.fechaFin) {
      this.toast.add({ severity: 'warn', summary: 'Filtro requerido', detail: 'Seleccione rango de fechas.' });
      return;
    }
    this.isLoading.set(true);
    this.datos.set([]);
    this.consultado.set(false);

    this.service.getAnexo(this.tipoSeleccionado(), this.fechaInicio, this.fechaFin).subscribe({
      next: data => {
        this.datos.set(data ?? []);
        this.consultado.set(true);
        this.isLoading.set(false);
      },
      error: err => {
        const detail = err.error?.message ?? err.message ?? 'Error al consultar.';
        this.toast.add({ severity: 'error', summary: 'Error', detail });
        this.isLoading.set(false);
        this.consultado.set(true);
      }
    });
  }

  async exportarExcel() {
    const data = this.datos();
    const cols = this.columnas();
    if (!data.length) return;
    const nombre = `F07_${this.tipoSeleccionado()}_${this.fechaInicio}_${this.fechaFin}`;
    await this.service.exportarExcel(data, cols, nombre);
  }

  exportarCsv() {
    const data = this.datos();
    const cols = this.columnas();
    if (!data.length) return;

    const nombre = `F07_${this.tipoSeleccionado()}_${this.fechaInicio}_${this.fechaFin}`;
    this.service.exportarCsv(data, cols, nombre);
  }

  celdaTexto(row: any, col: ColumnDef): string {
    const val = row[col.field];
    if (val == null) return '';
    return String(val);
  }

  celdaNumero(row: any, col: ColumnDef): string {
    const val = Number(row[col.field]);
    if (!Number.isFinite(val) || val === 0) return '—';
    return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  onTipoChange(tipo: string) {
    this.tipoSeleccionado.set(tipo);
    this.datos.set([]);
    this.consultado.set(false);
  }
}
