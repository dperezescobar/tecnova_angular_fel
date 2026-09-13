import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { EuroAuthService } from './euro-auth.service';

export const euroAuthGuard: CanActivateFn = () => {
  const authService = inject(EuroAuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }

  router.navigate(['/login']);
  return false;
};