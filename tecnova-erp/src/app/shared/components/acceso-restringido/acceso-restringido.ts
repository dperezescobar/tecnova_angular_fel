import { ChangeDetectionStrategy, Component, input } from '@angular/core';

const MENSAJE_DEFAULT = 'No tiene permisos suficientes para acceder a esta sección. Contacte a un administrador o gerente.';

// Mismo tratamiento visual que ya usaba Cierre de Recibos para "Acceso Restringido": se reutiliza
// aquí en vez de construir un sistema de menú por rol -- la opción de menú queda visible para todos,
// y es la pantalla (respaldada por el 403 real del backend) la que bloquea el contenido.
@Component({
  selector: 'app-acceso-restringido',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './acceso-restringido.html',
  styleUrl: './acceso-restringido.scss'
})
export class AccesoRestringidoComponent {
  mensaje = input<string>(MENSAJE_DEFAULT);
}
