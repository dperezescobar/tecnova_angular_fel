import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface ManualCard {
  titulo: string;
  descripcion: string;
  icono: string;
  ruta: string;
  disponible: boolean;
}

@Component({
  selector: 'app-manuales-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './manuales-home.html',
  styleUrl: './manuales-home.scss'
})
export class ManualesHomeComponent {
  // Índice de manuales disponibles. Para agregar uno nuevo: crear su componente,
  // registrar su ruta en app.routes.ts y añadir la tarjeta aquí con disponible: true.
  manuales: ManualCard[] = [
    {
      titulo: 'Artículos',
      descripcion: 'Crear, editar y eliminar artículos del catálogo, incluyendo todas sus validaciones.',
      icono: 'bi bi-box-seam',
      ruta: '/manuales/articulos',
      disponible: true
    }
  ];
}
