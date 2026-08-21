import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// Manejador global para auto-recuperar la pantalla si falla la carga de un chunk tras un nuevo despliegue
if (typeof window !== 'undefined') {
  const isChunkError = (err: any): boolean => {
    const msg = String(err?.message || err || '');
    return (
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('Loading chunk') ||
      msg.includes('Importing a module script failed') ||
      msg.includes('CSS_CHUNK_LOAD_FAILED')
    );
  };

  window.addEventListener('error', (event) => {
    if (isChunkError(event.error) || isChunkError(event.message)) {
      event.preventDefault();
      console.warn('[AutoRecovery] Chunk antiguo no encontrado tras despliegue. Recargando app...');
      window.location.href = window.location.origin;
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    if (isChunkError(event.reason)) {
      event.preventDefault();
      console.warn('[AutoRecovery] Promesa de Chunk falló tras despliegue. Recargando app...');
      window.location.href = window.location.origin;
    }
  });
}

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
