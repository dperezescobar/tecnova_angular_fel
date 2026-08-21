import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { MenuService } from '../services/menu.service';

// Bloquea el acceso directo por URL a una opción no visible para el usuario.
// Fail-open: si el menú efectivo aún no cargó, o estamos en modo clásico, se permite (el sidebar ya filtra).
export const menuGuard: CanActivateFn = (route) => {
  const menu = inject(MenuService);
  const router = inject(Router);

  const clave = route.data?.['clave'] as string | undefined;
  if (!clave) return true;
  if (!menu.cargado() || menu.esClasico()) return true;
  if (menu.puedeVer(clave)) return true;

  router.navigate(['/inicio']);
  return false;
};
