import { ApplicationConfig, isDevMode, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

// CAMBIO 1: Importamos la versión "normal" (no async)
import { provideAnimations } from '@angular/platform-browser/animations'; 

import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { providePrimeNG } from 'primeng/config';
import { provideServiceWorker } from '@angular/service-worker';
import Aura from '@primeuix/themes/aura';
import { routes } from './app.routes';
import { jwtInterceptor } from './core/interceptors/jwt-interceptor'; // <--- Importar
export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withFetch(),
withInterceptors([jwtInterceptor])), // <--- Agregar el interceptor aquí
    
    // CAMBIO 2: Usamos la función estándar.
    // Esto elimina el warning y asegura que los modales de facturación abran al instante.
    provideAnimations(), 
    
    providePrimeNG({
        theme: {
            preset: Aura,
            options: {
                darkModeSelector: '.my-app-dark'
            }
        }
    }),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerImmediately'
    })
  ]
};