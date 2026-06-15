import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // 1. Obtenemos el valor actual del usuario desde tu Signal
  const usuarioActual = authService.currentUser();
  
  // 2. Definimos si está logueado: Es verdadero si usuarioActual NO es null
  const estaLogueado = usuarioActual !== null;

  // CASO A: El usuario quiere ir al Login ('/login')
  if (state.url === '/login') {
    if (estaLogueado) {
      // Si ya tiene sesión, lo pateamos al dashboard
      router.navigate(['/inicio']);
      return false;
    }
    // Si no tiene sesión, lo dejamos entrar al login
    return true;
  }

  // CASO B: El usuario quiere ir a cualquier otra página (Dashboard, etc.)
  if (!estaLogueado) {
    // Si NO tiene sesión, lo mandamos al login
    router.navigate(['/login']);
    return false;
  }

  // Si tiene sesión y va a una página interna, lo dejamos pasar
  return true;
};