import { Injectable, ApplicationRef, inject, signal, DestroyRef } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { Router, NavigationEnd } from '@angular/router';
import { filter, interval } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { APP_VERSION } from '../../../environments/version';

@Injectable({
  providedIn: 'root'
})
export class SwUpdateService {
  private readonly swUpdate = inject(SwUpdate);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly updateAvailable = signal<boolean>(false);
  readonly isActivating = signal<boolean>(false);

  constructor() {
    this.initUpdateCheck();
  }

  private initUpdateCheck(): void {
    // 1. Escuchar eventos de SwUpdate si el Service Worker está habilitado
    if (this.swUpdate.isEnabled) {
      this.swUpdate.versionUpdates
        .pipe(
          filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'),
          takeUntilDestroyed(this.destroyRef)
        )
        .subscribe(() => {
          console.log('[SwUpdateService] Nueva versión lista vía Service Worker');
          this.updateAvailable.set(true);
        });
    }

    // 2. Chequeo inicial inmediato a los 2 segundos
    setTimeout(() => this.chequearAhora(), 2000);

    // 3. Chequeo periódico cada 60 segundos
    interval(60 * 1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.chequearAhora();
      });

    // 4. Chequear en cada navegación de rutas
    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        if (this.updateAvailable() && !this.isActivating()) {
          this.aplicarActualizacionSilenciosa();
        } else {
          this.chequearAhora();
        }
      });
  }

  chequearAhora(): void {
    // A) Chequeo directo por HTTP a /version.json (100% infalible en cualquier navegador/IIS)
    fetch('/version.json?t=' + Date.now(), { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        if (data && data.version && data.version !== APP_VERSION) {
          console.log(`[SwUpdateService] Nueva versión detectada en servidor (${data.version} vs local ${APP_VERSION})`);
          this.updateAvailable.set(true);
        }
      })
      .catch(() => {});

    // B) Chequeo de respaldo vía Service Worker API si está disponible
    if (this.swUpdate.isEnabled) {
      try {
        this.swUpdate.checkForUpdate().then(hasUpdate => {
          if (hasUpdate) {
            console.log('[SwUpdateService] Nueva versión detectada vía SwUpdate.checkForUpdate()');
            this.updateAvailable.set(true);
          }
        }).catch(() => {});
      } catch {}
    }
  }

  aplicarActualizacion(): void {
    if (this.isActivating()) return;
    this.isActivating.set(true);

    if (this.swUpdate.isEnabled) {
      this.swUpdate.activateUpdate().catch(() => {});
    }

    // Recarga inmediata e infalible en 100ms
    setTimeout(() => {
      window.location.href = window.location.href;
    }, 100);
  }

  private aplicarActualizacionSilenciosa(): void {
    if (this.isActivating()) return;
    this.isActivating.set(true);

    if (this.swUpdate.isEnabled) {
      this.swUpdate.activateUpdate().catch(() => {});
    }

    setTimeout(() => {
      window.location.href = window.location.href;
    }, 100);
  }
}
