import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';

// Importación de los componentes hijos standalone fiscales
import { LibroContribuyentesComponent } from '../formatos/libro-contribuyentes/libro-contribuyentes';
import { LibroConsumidorFinalComponent } from '../formatos/libro-consumidor-final/libro-consumidor-final';

type TipoLibro = 'FAC' | 'CCF' | null;

@Component({
  selector: 'app-selector-libros',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    ButtonModule, 
    LibroContribuyentesComponent, 
    LibroConsumidorFinalComponent
  ],
  templateUrl: './selector-libros.html',
  styleUrl: './selector-libros.scss',
})
export class SelectorLibros {
  libroActivo = signal<TipoLibro>(null);

  // Inicialización de rangos automáticos por mes
  desde = signal<string>(this.formatDateInput(this.startOfMonth(new Date())));
  hasta = signal<string>(this.formatDateInput(this.endOfMonth(new Date())));

  setLibro(tipo: TipoLibro): void {
    this.libroActivo.set(tipo); 
  }

  // Actualizadores manuales para el control bidireccional estricto de las fechas
  onDesdeChange(value: string): void {
    this.desde.set(value);
  }

  onHastaChange(value: string): void {
    this.hasta.set(value);
  }

  private formatDateInput(value: Date | string): string {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return this.formatDateInput(new Date());
    }
    const yyyy = date.getFullYear();
    // getMonth() + 1 porque los meses en JavaScript inician en index 0
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private startOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  private endOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
  }
}