import { Injectable, inject, signal, DestroyRef } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { Router, NavigationEnd } from '@angular/router';
import { filter, interval } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { APP_VERSION } from '../../environments/version';

/** Mismo mecanismo que SwUpdateService de tecnova-erp, adaptado a la versión propia de EuroSoccer. */
@Injectable({
  providedIn: 'root'
})
export class EuroSwUpdateService {
  private readonly swUpdate = inject(SwUpdate);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly updateAvailable = signal<boolean>(false);
  readonly isActivating = signal<boolean>(false);

  constructor() {
    this.initUpdateCheck();
  }

  private initUpdateCheck(): void {
    if (this.swUpdate.isEnabled) {
      this.swUpdate.versionUpdates
        .pipe(
          filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'),
          takeUntilDestroyed(this.destroyRef)
        )
        .subscribe(() => {
          console.log('[EuroSwUpdateService] Nueva versión lista vía Service Worker');
          this.updateAvailable.set(true);
        });
    }

    setTimeout(() => this.chequearAhora(), 2000);

    interval(60 * 1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.chequearAhora());

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
    fetch('/version.json?t=' + Date.now(), { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        if (data && data.version && data.version !== APP_VERSION) {
          console.log(`[EuroSwUpdateService] Nueva versión detectada en servidor (${data.version} vs local ${APP_VERSION})`);
          this.updateAvailable.set(true);
        }
      })
      .catch(() => {});

    if (this.swUpdate.isEnabled) {
      try {
        this.swUpdate.checkForUpdate().then(hasUpdate => {
          if (hasUpdate) {
            console.log('[EuroSwUpdateService] Nueva versión detectada vía SwUpdate.checkForUpdate()');
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
